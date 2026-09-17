/**
 * CUIMS Auto Feedback - Form Filler Module
 * Reliably fills inputs and dispatches synthetic events for framework/PostBack compatibility.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CUIMS_FormFiller = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /**
   * Dispatches standard UI events (click, change, input, blur)
   */
  function dispatchEvents(el, eventNames = ["input", "change"]) {
    if (!el) return;
    for (const name of eventNames) {
      try {
        let ev;
        if (name === "click" || name.startsWith("pointer") || name.startsWith("mouse")) {
          ev = new MouseEvent(name, { bubbles: true, cancelable: true, view: window });
        } else {
          ev = new Event(name, { bubbles: true, cancelable: true });
        }
        el.dispatchEvent(ev);
      } catch (err) {
        // Fallback for older DOMs
        try {
          const fallbackEv = document.createEvent("Event");
          fallbackEv.initEvent(name, true, true);
          el.dispatchEvent(fallbackEv);
        } catch (e) {
          // Ignore event dispatch failure
        }
      }
    }
  }

  /**
   * Sets text on inputs or textareas respecting React/Vue/Angular property setters
   */
  function setTextValue(inputEl, value) {
    if (!inputEl) return;
    try { inputEl.focus(); } catch (e) {}

    const proto = inputEl.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

    if (nativeSetter) {
      nativeSetter.call(inputEl, value);
    } else {
      inputEl.value = value;
    }

    dispatchEvents(inputEl, ["input", "change"]);
  }

  /**
   * Selects an option in a <select> dropdown
   */
  function setSelectValue(selectEl, value) {
    if (!selectEl) return false;
    try { selectEl.focus(); } catch (e) {}

    let matched = false;
    for (let i = 0; i < selectEl.options.length; i++) {
      if (selectEl.options[i].value === value || selectEl.options[i].text.trim() === value) {
        selectEl.selectedIndex = i;
        matched = true;
        break;
      }
    }

    if (!matched && selectEl.options.length > 0) {
      selectEl.selectedIndex = selectEl.options.length - 1;
    }

    dispatchEvents(selectEl, ["input", "change"]);
    return true;
  }

  /**
   * Clicks a radio button or rating button safely
   */
  function clickRadioOrButton(element) {
    if (!element) return false;
    try { element.focus(); } catch (e) {}

    if (element.type === "radio") {
      element.checked = true;
    }

    try {
      element.click();
    } catch (e) {
      dispatchEvents(element, ["click", "change"]);
    }
    dispatchEvents(element, ["change"]);
    return true;
  }

  /**
   * Checks a checkbox input
   */
  function setCheckbox(checkboxEl, checked = true) {
    if (!checkboxEl) return false;
    checkboxEl.focus();
    if (checkboxEl.checked !== checked) {
      checkboxEl.checked = checked;
      dispatchEvents(checkboxEl, ["click", "change", "blur"]);
    }
    return true;
  }

  /**
   * Fills all parsed questions with their decided answers
   */
  async function fillForm(questions, decisions, options = { delayBetween: 20 }) {
    let filledCount = 0;
    let failedCount = 0;
    const details = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const d = decisions[i];

      if (!d) {
        failedCount++;
        details.push({ questionId: q.id, success: false, reason: "No decision generated" });
        continue;
      }

      if (d.unknownType) {
        console.warn(`[CUIMS Auto Feedback] Skipping unknown question type for: "${q.questionText}"`);
        failedCount++;
        details.push({ questionId: q.id, success: false, reason: "Unknown question type" });
        continue;
      }

      let success = false;
      try {
        switch (q.type) {
          case "rating":
          case "radio": {
            if (d.targetOption && d.targetOption.element) {
              success = clickRadioOrButton(d.targetOption.element);
              const label = d.targetOption.label || d.targetOption.value;
              console.log(`[CUIMS Auto Feedback] Answer selected: ${label} for "${q.questionText}"`);
            } else {
              console.warn(`[CUIMS Auto Feedback] ERROR: Could not determine answer for question: "${q.questionText}"`);
            }
            break;
          }

          case "select": {
            if (q.inputElement) {
              const val = d.targetOption ? d.targetOption.value : d.valueToSet;
              success = setSelectValue(q.inputElement, val);
              console.log(`[CUIMS Auto Feedback] Dropdown set: ${val} for "${q.questionText}"`);
            }
            break;
          }

          case "textarea":
          case "text": {
            if (q.inputElement) {
              setTextValue(q.inputElement, d.valueToSet);
              success = true;
              console.log(`[CUIMS Auto Feedback] Text response filled for "${q.questionText}"`);
            }
            break;
          }

          case "checkbox": {
            if (q.inputElement) {
              success = setCheckbox(q.inputElement, Boolean(d.valueToSet));
            }
            break;
          }
        }
      } catch (err) {
        console.error(`[CUIMS Auto Feedback] Error filling question ${q.id}:`, err);
        success = false;
      }

      if (success) {
        filledCount++;
        details.push({ questionId: q.id, success: true, answer: d.valueToSet || (d.targetOption && d.targetOption.label) });
      } else {
        failedCount++;
        details.push({ questionId: q.id, success: false, reason: "Element action failed" });
      }

      // Small pause if configured to allow UI to breathe
      if (options.delayBetween > 0) {
        await new Promise((resolve) => setTimeout(resolve, options.delayBetween));
      }
    }

    return {
      success: failedCount === 0 || filledCount > 0,
      filledCount,
      failedCount,
      total: questions.length,
      details
    };
  }

  return {
    fillForm,
    clickRadioOrButton,
    setTextValue,
    setSelectValue,
    setCheckbox,
    dispatchEvents
  };
});
