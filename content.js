/**
 * CUIMS Auto Feedback - Main Content Script Orchestrator
 * Connects MutationObserver, semantic detector, parser, filler, and submit verifier.
 */

(async function () {
  console.log("[CUIMS Auto Feedback] Extension loaded");
  console.log("[CUIMS Auto Feedback] CUIMS page detected");

  let isProcessing = false;
  let hasHandledCurrentSession = false;

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
   * Main scan & execution pipeline
   */
  async function scanAndProcessForm(isManual = false) {
    if (isProcessing) return;
    if (!config.enabled && !isManual) return;

    try {
      console.log("[CUIMS Auto Feedback] Searching for feedback form...");

      // 1. Semantic Detection
      const detectionResult = window.CUIMS_Detector.detectFeedbackForm(document);

      if (!detectionResult.detected) {
        if (isManual) {
          console.warn("[CUIMS Auto Feedback] No feedback form detected on this page.");
          saveStatus("NO_FORM_DETECTED", "No feedback form detected on this page.");
        }
        return;
      }

      console.log(`[CUIMS Auto Feedback] Feedback form detected (${detectionResult.type}, confidence: ${detectionResult.confidence}%)`);

      const container = detectionResult.container;

      // 2. Parse Form Questions
      const questions = window.CUIMS_FormParser.parseFeedbackForm(container);

      if (questions.length === 0) {
        console.warn("[CUIMS Auto Feedback] Feedback container found, but 0 questions could be parsed.");
        return;
      }

      console.log(`[CUIMS Auto Feedback] Found ${questions.length} questions`);

      // 3. Duplicate Protection Check
      const fingerprint = window.CUIMS_SubmitVerifier.generateFormFingerprint(questions);
      const isDuplicate = await window.CUIMS_SubmitVerifier.checkDuplicateSubmission(
        fingerprint,
        config.duplicateWindowMinutes
      );

      if (isDuplicate && !isManual) {
        console.log("[CUIMS Auto Feedback] Form was already submitted recently. Skipping to prevent duplicate.");
        saveStatus("SKIPPED_DUPLICATE", "Form already submitted recently.");
        return;
      }

      isProcessing = true;

      // 4. Decide Answers
      const decisions = questions.map((q, idx) => {
        console.log(`[CUIMS Auto Feedback] Processing question ${idx + 1}`);
        return window.CUIMS_AnswerEngine.determineAnswer(q, config, rules);
      });

      // 5. Fill Form Elements
      const fillResult = await window.CUIMS_FormFiller.fillForm(questions, decisions, {
        delayBetween: config.typingDelayMs || 15
      });

      console.log(`[CUIMS Auto Feedback] Filled ${fillResult.filledCount}/${questions.length} questions`);

      // 6. Validate Completeness
      const validation = window.CUIMS_SubmitVerifier.validateQuestions(questions);

      if (!validation.isValid) {
        const missingNames = validation.missingQuestions.map((q) => `"${q.questionText}"`).join(", ");
        console.error(`[CUIMS Auto Feedback] ERROR: Required questions left unanswered: ${missingNames}`);
        saveStatus("VALIDATION_FAILED", `Unanswered required questions: ${missingNames}`);
        isProcessing = false;
        return;
      }

      console.log("[CUIMS Auto Feedback] All required fields completed");

      // 7. Submission or Safe Halt
      if (!config.autoSubmit && !isManual) {
        console.log("[CUIMS Auto Feedback] Auto-submit is disabled. Form filled successfully for manual review.");
        await window.CUIMS_SubmitVerifier.recordSubmission(fingerprint, {
          status: "FILLED_AWAITING_SUBMIT",
          questionCount: questions.length
        });
        saveStatus("FILLED_AWAITING_SUBMIT", "Form filled. Auto-submit is off.");
        isProcessing = false;
        return;
      }

      // Locate Submit Button
      const submitBtn = window.CUIMS_SubmitVerifier.findSubmitButton(container);

      if (!submitBtn) {
        console.error("[CUIMS Auto Feedback] ERROR: Could not locate submit button in form container.");
        saveStatus("BUTTON_NOT_FOUND", "Submit button could not be located.");
        isProcessing = false;
        return;
      }

      // Submit & Verify
      const outcome = await window.CUIMS_SubmitVerifier.submitAndVerify(submitBtn, container, questions);

      console.log(`[CUIMS Auto Feedback] Submission successful: ${outcome.reason}`);

      // Record successful state
      await window.CUIMS_SubmitVerifier.recordSubmission(fingerprint, {
        status: "SUCCESS",
        questionCount: questions.length
      });

      saveStatus("SUCCESS", `Submitted successfully (${questions.length} questions)`);
      hasHandledCurrentSession = true;

      // Notify background service worker to update badge
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: "SUBMISSION_COMPLETED",
          questionCount: questions.length
        }).catch(() => {});
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

  // Set up debounced MutationObserver to detect dynamically injected forms/modals
  let debounceTimeout = null;
  const observer = new MutationObserver((mutations) => {
    if (hasHandledCurrentSession || isProcessing) return;

    // Check if added nodes contain form, modal, table or button
    let relevantMutation = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName.toLowerCase();
            if (tag === "form" || tag === "table" || tag === "div" || tag === "dialog") {
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
        scanAndProcessForm();
      }, config.detectionDelayMs || 600);
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

  // Initial scan after DOM idle delay
  setTimeout(() => {
    scanAndProcessForm();
  }, config.detectionDelayMs || 600);

  // Fallback periodic check (e.g., if page loads components without triggering mutation event)
  let fallbackCount = 0;
  const fallbackInterval = setInterval(() => {
    if (hasHandledCurrentSession || fallbackCount >= 5) {
      clearInterval(fallbackInterval);
      return;
    }
    fallbackCount++;
    if (!isProcessing) {
      scanAndProcessForm();
    }
  }, 3000);

  // Listen for messages from popup (e.g. manual trigger)
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "MANUAL_TRIGGER") {
        scanAndProcessForm(true).then(() => {
          sendResponse({ success: true });
        });
        return true; // async
      } else if (request.action === "GET_PAGE_STATUS") {
        const detection = window.CUIMS_Detector.detectFeedbackForm(document);
        sendResponse({
          detected: detection.detected,
          type: detection.type,
          confidence: detection.confidence
        });
        return false;
      }
    });
  }
})();
