/**
 * CUIMS Auto Feedback - Main Content Script Orchestrator (v1.1.0)
 * Connects MutationObserver, multi-unit detector, parser, filler, and sequential submit verifier.
 */

(async function () {
  console.log("[CUIMS Auto Feedback] Extension v1.1.0 loaded");
  console.log("[CUIMS Auto Feedback] Monitoring CUIMS page...");

  let isProcessing = false;
  const submittedUnitIds = new Set();

  // Load active configuration
  let config = await window.getActiveConfig();
  const rules = window.CUIMS_QUESTION_RULES || [];

  // Listen for config changes in real-time
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "sync" || areaName === "local") {
        window.getActiveConfig().then((newConfig) => {
          config = newConfig;
        });
      }
    });
  }

  /**
   * Main scan & execution pipeline supporting multi-form sequential batching
   */
  async function scanAndProcessForms(isManual = false) {
    if (isProcessing) return;
    if (!config.enabled && !isManual) return;

    try {
      // 1. Detect all feedback units on the page
      const units = window.CUIMS_Detector.detectFeedbackUnits(document);

      if (!units || units.length === 0) {
        if (isManual) {
          console.warn("[CUIMS Auto Feedback] No feedback forms detected on this page.");
          saveStatus("NO_FORM_DETECTED", "No feedback forms detected on this page.");
        }
        return;
      }

      // 2. Filter out units already submitted in this session
      const pendingUnits = units.filter((u) => !submittedUnitIds.has(u.id));

      if (pendingUnits.length === 0) {
        if (isManual) {
          saveStatus("ALREADY_SUBMITTED", "All detected forms have already been submitted.");
        }
        return;
      }

      console.log(`[CUIMS Auto Feedback] Found ${pendingUnits.length} pending feedback unit(s)`);
      isProcessing = true;

      let submittedCount = 0;
      const totalUnits = pendingUnits.length;

      for (let i = 0; i < totalUnits; i++) {
        const unit = pendingUnits[i];
        console.log(`[CUIMS Auto Feedback] Processing unit ${i + 1}/${totalUnits}: ${unit.title || unit.id}`);

        saveStatus(
          "PROCESSING",
          `Processing ${i + 1} of ${totalUnits}: ${unit.title || unit.id}...`
        );

        // Parse questions for this unit container
        const questions = window.CUIMS_FormParser.parseFeedbackForm(unit.container);

        if (!questions || questions.length === 0) {
          console.warn(`[CUIMS Auto Feedback] Unit ${unit.id} has 0 parseable questions, skipping.`);
          submittedUnitIds.add(unit.id);
          continue;
        }

        // Duplicate protection check with unit context
        const fingerprint = window.CUIMS_SubmitVerifier.generateFormFingerprint(
          questions,
          window.location.href,
          unit.title || unit.id
        );

        const isDuplicate = await window.CUIMS_SubmitVerifier.checkDuplicateSubmission(
          fingerprint,
          config.duplicateWindowMinutes
        );

        if (isDuplicate && !isManual) {
          console.log(`[CUIMS Auto Feedback] Unit ${unit.title || unit.id} was already submitted recently. Skipping.`);
          submittedUnitIds.add(unit.id);
          continue;
        }

        // Decide answers
        const decisions = questions.map((q) => {
          return window.CUIMS_AnswerEngine.determineAnswer(q, config, rules);
        });

        // Fill form elements (using snappy typingDelayMs, default 2ms)
        const fillResult = await window.CUIMS_FormFiller.fillForm(questions, decisions, {
          delayBetween: config.typingDelayMs !== undefined ? config.typingDelayMs : 2
        });

        console.log(`[CUIMS Auto Feedback] Filled ${fillResult.filledCount}/${questions.length} questions for ${unit.title || unit.id}`);

        // Validate completeness
        const validation = window.CUIMS_SubmitVerifier.validateQuestions(questions);
        if (!validation.isValid) {
          const missingNames = validation.missingQuestions.map((q) => `"${q.questionText}"`).join(", ");
          console.error(`[CUIMS Auto Feedback] Required questions left unanswered: ${missingNames}`);
          saveStatus("VALIDATION_FAILED", `Unanswered in ${unit.title || unit.id}: ${missingNames}`);
          continue;
        }

        // Handle auto-submit or halt
        if (!config.autoSubmit && !isManual) {
          console.log(`[CUIMS Auto Feedback] Auto-submit disabled. Unit ${unit.id} filled for review.`);
          await window.CUIMS_SubmitVerifier.recordSubmission(fingerprint, {
            status: "FILLED_AWAITING_SUBMIT",
            questionCount: questions.length,
            unitTitle: unit.title
          });
          submittedUnitIds.add(unit.id);
          continue;
        }

        // Locate submit button
        const submitBtn = unit.submitButton || window.CUIMS_SubmitVerifier.findSubmitButton(unit.container);

        if (!submitBtn) {
          console.error(`[CUIMS Auto Feedback] Could not locate submit button for unit ${unit.id}`);
          saveStatus("BUTTON_NOT_FOUND", `Submit button missing for ${unit.title || unit.id}`);
          submittedUnitIds.add(unit.id);
          continue;
        }

        // Submit & Verify
        const outcome = await window.CUIMS_SubmitVerifier.submitAndVerify(submitBtn, unit.container, questions);
        console.log(`[CUIMS Auto Feedback] Unit ${unit.title || unit.id} submitted: ${outcome.reason}`);

        // Record submission
        await window.CUIMS_SubmitVerifier.recordSubmission(fingerprint, {
          status: "SUCCESS",
          questionCount: questions.length,
          unitTitle: unit.title
        });

        submittedUnitIds.add(unit.id);
        submittedCount++;

        // Notify background service worker with progress
        if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({
            action: "SUBMISSION_PROGRESS",
            current: submittedCount,
            total: totalUnits,
            unitTitle: unit.title
          }).catch(() => {});
        }

        // Sequential interval to let ASP.NET / server settle between multiple submissions
        if (i < totalUnits - 1) {
          await new Promise((resolve) => setTimeout(resolve, config.multiFormIntervalMs || 350));
        }
      }

      // All units processed
      if (submittedCount > 0) {
        saveStatus("SUCCESS", `Submitted ${submittedCount} of ${totalUnits} feedback forms successfully.`);
        if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({
            action: "ALL_COMPLETED",
            count: submittedCount
          }).catch(() => {});
        }
      } else if (!config.autoSubmit) {
        saveStatus("FILLED_AWAITING_SUBMIT", `Filled ${totalUnits} feedback forms. Auto-submit is OFF.`);
      }

    } catch (error) {
      console.error("[CUIMS Auto Feedback] Unexpected error during form automation:", error);
      saveStatus("ERROR", error.message);
    } finally {
      isProcessing = false;
    }
  }

  /**
   * Helper to persist live state for popup display
   */
  function saveStatus(status, message) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        liveStatus: {
          status,
          message,
          timestamp: new Date().toLocaleTimeString(),
          url: window.location.href
        }
      });
    }
  }

  // Set up debounced MutationObserver for dynamic/AJAX/next-page forms
  let debounceTimeout = null;
  const observer = new MutationObserver((mutations) => {
    if (isProcessing) return;

    let relevantMutation = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName.toLowerCase();
            if (tag === "form" || tag === "table" || tag === "div" || tag === "dialog" || tag === "tr") {
              relevantMutation = true;
              break;
            }
          }
        }
      }
      if (relevantMutation) break;
    }

    if (relevantMutation) {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        scanAndProcessForms();
      }, config.detectionDelayMs || 200);
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

  // Initial scan after brief DOM idle delay (200ms)
  setTimeout(() => {
    scanAndProcessForms();
  }, config.detectionDelayMs || 200);

  // Periodic safety check every 2 seconds for non-mutation AJAX updates
  let checkCycles = 0;
  const periodicInterval = setInterval(() => {
    checkCycles++;
    if (checkCycles > 15) { // Stop after 30s of inactivity
      clearInterval(periodicInterval);
      return;
    }
    if (!isProcessing) {
      scanAndProcessForms();
    }
  }, 2000);

  // Message listener for popup triggers
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "MANUAL_TRIGGER") {
        scanAndProcessForms(true).then(() => {
          sendResponse({ success: true });
        });
        return true;
      } else if (request.action === "GET_PAGE_STATUS") {
        const units = window.CUIMS_Detector.detectFeedbackUnits(document);
        sendResponse({
          detected: units.length > 0,
          unitCount: units.length,
          units: units.map((u) => ({ id: u.id, title: u.title, type: u.type }))
        });
        return false;
      }
    });
  }
})();
