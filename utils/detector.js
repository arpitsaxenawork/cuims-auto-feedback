/**
 * CUIMS Auto Feedback - Detector Module
 * Robust semantic detection of feedback forms without brittle selectors.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CUIMS_Detector = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const POSITIVE_KEYWORDS = [
    "feedback",
    "evaluation",
    "survey",
    "faculty feedback",
    "teacher feedback",
    "student feedback",
    "course evaluation",
    "academic feedback",
    "instructor rating",
    "rating scale",
    "rate the following",
    "strongly agree",
    "strongly disagree",
    "teaching effectiveness",
    "curriculum feedback",
    "feedback form",
    "submit feedback"
  ];

  const NEGATIVE_KEYWORDS = [
    "login",
    "sign in",
    "forgot password",
    "enter password",
    "enter uid",
    "captcha",
    "student login",
    "user authentication",
    "pay fee",
    "fee receipt",
    "hall ticket",
    "admit card"
  ];

  const SUBMIT_BUTTON_KEYWORDS = [
    "submit",
    "save",
    "proceed",
    "finish",
    "save feedback",
    "submit feedback",
    "submit evaluation",
    "done"
  ];

  /**
   * Normalizes text for matching
   */
  function normalize(str) {
    return (str || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  /**
   * Checks if an element is visible in the viewport or layout
   */
  function isVisible(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    const style = window.getComputedStyle ? window.getComputedStyle(el) : el.style;
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /**
   * Scans a target container or document for feedback indicators
   * and calculates a confidence score (0 to 100%).
   */
  function analyzeCandidate(container) {
    if (!container || !isVisible(container)) {
      return { detected: false, confidence: 0, container: null, reasons: [] };
    }

    const reasons = [];
    let score = 0;

    // 1. HARD SAFETY CHECK: Login / Credential Detection
    const hasPasswordInput = container.querySelector('input[type="password"]');
    if (hasPasswordInput) {
      return {
        detected: false,
        confidence: 0,
        container,
        reasons: ["Ignored: Contains password input field (safety safeguard)"]
      };
    }

    const textContent = normalize(container.innerText || container.textContent || "");

    // Check for negative phrases indicating login / authentication screens
    for (const neg of NEGATIVE_KEYWORDS) {
      if (textContent.includes(neg) && (textContent.includes("enter") || textContent.includes("password"))) {
        return {
          detected: false,
          confidence: 0,
          container,
          reasons: [`Ignored: Contains credential text "${neg}"`]
        };
      }
    }

    // 2. Keyword density in container headers / titles
    const headings = Array.from(container.querySelectorAll("h1, h2, h3, h4, h5, h6, .modal-title, .panel-title, .title, legend, th, b, strong"));
    let headingMatch = false;
    for (const h of headings) {
      const hText = normalize(h.textContent);
      for (const kw of POSITIVE_KEYWORDS) {
        if (hText.includes(kw)) {
          headingMatch = true;
          score += 35;
          reasons.push(`Header keyword match: "${kw}" in <${h.tagName.toLowerCase()}>`);
          break;
        }
      }
      if (headingMatch) break;
    }

    // If no heading match, test overall text for strong feedback keywords
    if (!headingMatch) {
      for (const kw of POSITIVE_KEYWORDS) {
        if (textContent.includes(kw)) {
          score += 20;
          reasons.push(`Body text keyword match: "${kw}"`);
          break;
        }
      }
    }

    // 3. Repeated rating or radio structures (e.g. matrix of 1..5 or Excellent..Poor)
    const radioInputs = Array.from(container.querySelectorAll('input[type="radio"]'));
    const uniqueRadioGroups = new Set(radioInputs.map((r) => r.name).filter(Boolean));

    if (uniqueRadioGroups.size >= 2) {
      score += 30;
      reasons.push(`Found multiple radio groups (${uniqueRadioGroups.size} groups)`);
    } else if (radioInputs.length >= 4) {
      score += 20;
      reasons.push(`Found ${radioInputs.length} radio inputs`);
    }

    // 4. Rating scales / select options / table grid rows
    const selectElements = Array.from(container.querySelectorAll("select"));
    const starWidgets = Array.from(container.querySelectorAll('[class*="star" i], [class*="rating" i], [aria-label*="star" i]'));
    const matrixRows = Array.from(container.querySelectorAll("tr")).filter((tr) => {
      return tr.querySelectorAll('input[type="radio"], select, .rating-item').length > 0;
    });

    if (matrixRows.length >= 2) {
      score += 25;
      reasons.push(`Found question matrix table with ${matrixRows.length} question rows`);
    }

    if (selectElements.length > 0) {
      score += 10;
      reasons.push(`Found ${selectElements.length} dropdown elements`);
    }

    if (starWidgets.length > 0) {
      score += 15;
      reasons.push(`Found rating/star interactive widgets`);
    }

    // 5. Submit / Action Button Presence
    const buttons = Array.from(container.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn, [role="button"]'));
    let hasSubmitButton = false;
    for (const btn of buttons) {
      if (!isVisible(btn)) continue;
      const btnText = normalize(btn.value || btn.innerText || btn.getAttribute("aria-label") || "");
      if (SUBMIT_BUTTON_KEYWORDS.some((kw) => btnText === kw || btnText.includes(kw))) {
        hasSubmitButton = true;
        score += 15;
        reasons.push(`Identified action button with label: "${btnText}"`);
        break;
      }
    }

    // Cap confidence at 100
    const confidence = Math.min(score, 100);
    const detected = confidence >= 50;

    return {
      detected,
      confidence,
      container,
      hasSubmitButton,
      questionCountEstimate: Math.max(uniqueRadioGroups.size, matrixRows.length, selectElements.length),
      reasons
    };
  }

  /**
   * Main detector function.
   * Prioritizes modals and popups first, then falls back to whole page/forms.
   */
  function detectFeedbackForm(rootDoc = document) {
    // Check modals / dialogs / popups first (very common on CUIMS post-login)
    const modalSelectors = [
      '.modal.show',
      '.modal.in',
      '.modal:not([style*="display: none"]):not([style*="display:none"])',
      'dialog[open]',
      '[role="dialog"]',
      '.swal2-container',
      '.fancybox-wrap',
      '[id*="modal" i]',
      '[id*="popup" i]',
      '[id*="dialog" i]',
      '[class*="modal" i]',
      '[class*="popup" i]'
    ];

    for (const selector of modalSelectors) {
      const candidateModals = Array.from(rootDoc.querySelectorAll(selector));
      for (const modal of candidateModals) {
        const result = analyzeCandidate(modal);
        if (result.detected) {
          result.type = "modal";
          return result;
        }
      }
    }

    // Check distinct forms or dedicated feedback containers
    const containerSelectors = [
      'form[id*="feedback" i]',
      'form[name*="feedback" i]',
      'form[action*="feedback" i]',
      '[id*="feedback" i]',
      '[class*="feedback" i]',
      '[id*="survey" i]',
      '[class*="survey" i]',
      '[id*="evaluation" i]',
      'table[id*="feedback" i]',
      'table[id*="grid" i]',
      'form',
      'main',
      '#content',
      '#main-content',
      '.container',
      'body'
    ];

    for (const selector of containerSelectors) {
      const candidates = Array.from(rootDoc.querySelectorAll(selector));
      for (const cand of candidates) {
        // Skip tiny containers
        if (cand.querySelectorAll('input, select, textarea').length === 0) continue;
        const result = analyzeCandidate(cand);
        if (result.detected) {
          result.type = selector.includes("modal") ? "modal" : "page";
          return result;
        }
      }
    }

    return {
      detected: false,
      confidence: 0,
      container: null,
      type: "none",
      reasons: ["No feedback form patterns met the confidence threshold."]
    };
  }

  return {
    detectFeedbackForm,
    analyzeCandidate,
    isVisible,
    POSITIVE_KEYWORDS,
    NEGATIVE_KEYWORDS
  };
});
