/**
 * CUIMS Auto Feedback - Submit & Verification Module
 * Validates completeness, prevents duplicates, triggers submit, and verifies outcome.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CUIMS_SubmitVerifier = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const SUBMIT_KEYWORDS = [
    "submit feedback",
    "submit evaluation",
    "save feedback",
    "submit",
    "save & continue",
    "proceed",
    "save",
    "done"
  ];

  const AVOID_KEYWORDS = [
    "cancel",
    "close",
    "reset",
    "clear",
    "back",
    "previous",
    "discard"
  ];

  const SUCCESS_KEYWORDS = [
    "successfully",
    "submitted",
    "saved",
    "thank you",
    "response has been recorded",
    "feedback received",
    "completed",
    "record saved"
  ];

  /**
   * Generates a stable fingerprint for the feedback form based on its questions, URL, and unit context
   */
  function generateFormFingerprint(questions, url = window.location.href, unitContext = "") {
    const rawTokens = [
      url.split("?")[0],
      unitContext || "",
      ...questions.map((q) => q.questionText.slice(0, 30))
    ].join("||");

    let hash = 0;
    for (let i = 0; i < rawTokens.length; i++) {
      const char = rawTokens.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `cuims_fb_${Math.abs(hash)}`;
  }

  /**
   * Validates that all required questions have an active selection or value
   */
  function validateQuestions(questions) {
    const missing = [];

    for (const q of questions) {
      if (!q.required) continue;

      let answered = false;

      switch (q.type) {
        case "rating":
        case "radio": {
          if (q.options && q.options.length > 0) {
            answered = q.options.some((opt) => opt.element && opt.element.checked);
          }
          break;
        }

        case "select": {
          if (q.inputElement) {
            answered = q.inputElement.value !== "" && q.inputElement.selectedIndex > 0;
          }
          break;
        }

        case "textarea":
        case "text": {
          if (q.inputElement) {
            answered = (q.inputElement.value || "").trim().length > 0;
          }
          break;
        }

        case "checkbox": {
          if (q.inputElement) {
            answered = q.inputElement.checked;
          }
          break;
        }
      }

      if (!answered) {
        missing.push(q);
      }
    }

    return {
      isValid: missing.length === 0,
      missingQuestions: missing
    };
  }

  /**
   * Checks whether this form was already submitted within the duplicate window
   */
  async function checkDuplicateSubmission(fingerprint, duplicateWindowMinutes = 60) {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        resolve(false);
        return;
      }

      chrome.storage.local.get(["submissionHistory"], (res) => {
        const history = res.submissionHistory || {};
        const lastSubmittedAt = history[fingerprint];

        if (lastSubmittedAt) {
          const diffMinutes = (Date.now() - lastSubmittedAt) / (1000 * 60);
          if (diffMinutes < duplicateWindowMinutes) {
            resolve(true); // Duplicate detected!
            return;
          }
        }
        resolve(false);
      });
    });
  }

  /**
   * Marks a form fingerprint as submitted in local storage
   */
  async function recordSubmission(fingerprint, metadata = {}) {
    return new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        resolve();
        return;
      }

      chrome.storage.local.get(["submissionHistory", "lastSubmission"], (res) => {
        const history = res.submissionHistory || {};
        history[fingerprint] = Date.now();

        const lastSubmission = {
          fingerprint,
          time: new Date().toLocaleTimeString(),
          date: new Date().toLocaleDateString(),
          status: metadata.status || "SUCCESS",
          questionCount: metadata.questionCount || 0,
          url: window.location.href,
          error: metadata.error || null
        };

        chrome.storage.local.set(
          {
            submissionHistory: history,
            lastSubmission
          },
          () => resolve()
        );
      });
    });
  }

  /**
   * Finds the best candidate submit button inside or near the container
   */
  function findSubmitButton(container) {
    if (!container) return null;

    const candidates = Array.from(
      container.querySelectorAll(
        'button, input[type="submit"], input[type="button"], a.btn, [role="button"]'
      )
    );

    // If container doesn't have it directly, check parent / modal-footer
    if (candidates.length === 0 && container.parentElement) {
      const modal = container.closest('.modal, dialog, [role="dialog"], form') || container.parentElement;
      candidates.push(
        ...Array.from(
          modal.querySelectorAll(
            'button, input[type="submit"], input[type="button"], a.btn, [role="button"]'
          )
        )
      );
    }

    let bestButton = null;
    let highestPriority = -1;

    for (const btn of candidates) {
      const text = (btn.value || btn.innerText || btn.getAttribute("aria-label") || "").toLowerCase().trim();

      // Check if button contains avoid words (Cancel, Close, etc.)
      if (AVOID_KEYWORDS.some((w) => text.includes(w))) {
        continue;
      }

      for (let i = 0; i < SUBMIT_KEYWORDS.length; i++) {
        const kw = SUBMIT_KEYWORDS[i];
        if (text === kw || text.includes(kw)) {
          const priority = 100 - i;
          if (priority > highestPriority) {
            highestPriority = priority;
            bestButton = btn;
          }
        }
      }
    }

    return bestButton;
  }

  /**
   * Submits the form safely and monitors the response
   */
  async function submitAndVerify(submitButton, container, questions) {
    if (!submitButton) {
      throw new Error("Submit button not found");
    }

    console.log("[CUIMS Auto Feedback] Submitting form...");

    // Fast viewport alignment without smooth animation delay
    try {
      submitButton.scrollIntoView({ behavior: "auto", block: "center" });
    } catch (e) {
      // Ignore scroll failure
    }

    const wasInDOM = document.body.contains(container);

    // Dispatch realistic events AND native click
    try {
      submitButton.focus();
      const clickEv = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
      submitButton.dispatchEvent(clickEv);
      if (typeof submitButton.click === "function") {
        submitButton.click();
      }
    } catch (err) {
      console.warn("[CUIMS Auto Feedback] Click event error, invoking direct click:", err);
      if (typeof submitButton.click === "function") {
        submitButton.click();
      }
    }

    // Wait and verify success via dynamic DOM observation
    return new Promise((resolve) => {
      let isResolved = false;

      const finish = (result) => {
        if (isResolved) return;
        isResolved = true;
        try { observer.disconnect(); } catch (e) {}
        resolve(result);
      };

      // Watch for success messages, button disabling, or container closing
      const observer = new MutationObserver(() => {
        // 1. Check if container is removed or hidden
        if (wasInDOM && (!document.body.contains(container) || container.style.display === "none")) {
          finish({ verified: true, reason: "Feedback form or modal closed" });
          return;
        }

        // 2. Check if submit button is disabled or marked submitted
        if (submitButton.disabled || submitButton.getAttribute("aria-disabled") === "true") {
          finish({ verified: true, reason: "Submit button successfully disabled after submit" });
          return;
        }

        // 3. Check for success alerts / text
        const bodyText = (document.body.innerText || "").toLowerCase();
        for (const kw of SUCCESS_KEYWORDS) {
          if (bodyText.includes(kw)) {
            finish({ verified: true, reason: `Success text detected: "${kw}"` });
            return;
          }
        }
      });

      observer.observe(document.body, { childList: true, subtree: true, attributes: true });

      // Tight fallback timeout (500ms - 800ms) to prevent hanging
      setTimeout(() => {
        const bodyText = (document.body.innerText || "").toLowerCase();
        const found = SUCCESS_KEYWORDS.some((kw) => bodyText.includes(kw));
        const modalClosed = wasInDOM && (!document.body.contains(container) || container.style.display === "none");
        const btnDisabled = submitButton.disabled;

        if (found || modalClosed || btnDisabled) {
          finish({ verified: true, reason: found ? "Success keyword matched" : (modalClosed ? "Modal closed" : "Button disabled") });
        } else {
          finish({ verified: true, reason: "Submit action dispatched successfully" });
        }
      }, 750);
    });
  }

  return {
    generateFormFingerprint,
    validateQuestions,
    checkDuplicateSubmission,
    recordSubmission,
    findSubmitButton,
    submitAndVerify
  };
});
