/**
 * CUIMS Auto Feedback - Form Parser Module
 * Robustly parses multiple feedback form paradigms into unified question objects.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CUIMS_FormParser = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  /**
   * Cleans question text: removes numbering prefixes (e.g., "1.", "Q1:", "(a)"), asterisks, and trims.
   */
  function cleanQuestionText(rawText) {
    if (!rawText) return "";
    return rawText
      .replace(/\s+/g, " ")
      .replace(/^[\s\d\.\)\(\:\-]+/g, "") // leading "1.", "(1)", "Q1:"
      .replace(/[\*]+$/g, "") // trailing asterisk
      .trim();
  }

  function isRequired(element, labelText) {
    if (!element) return false;
    if (element.hasAttribute("required") || element.getAttribute("aria-required") === "true") {
      return true;
    }
    if (element.classList && (element.classList.contains("required") || element.classList.contains("mandatory"))) {
      return true;
    }
    if (labelText && (labelText.includes("*") || /required/i.test(labelText))) {
      return true;
    }
    // Parent check
    const parent = element.closest(".form-group, .question-item, tr, td, div");
    if (parent) {
      if (parent.querySelector(".required, .mandatory, [aria-required='true'], [required]")) {
        return true;
      }
      const parentText = parent.innerText || "";
      if (parentText.includes("*")) return true;
    }
    return false;
  }

  /**
   * Resolves label for an input: checks associated <label>, parent label, aria-label, title, or next sibling.
   */
  function findOptionLabel(inputEl, fallbackIndex = null) {
    // 1. Label with for="id"
    if (inputEl.id) {
      const associatedLabel = document.querySelector(`label[for="${CSS.escape(inputEl.id)}"]`);
      if (associatedLabel && associatedLabel.textContent.trim()) {
        return associatedLabel.textContent.trim();
      }
    }

    // 2. Wrapping label
    const parentLabel = inputEl.closest("label");
    if (parentLabel && parentLabel.textContent.trim()) {
      return parentLabel.textContent.replace(inputEl.value || "", "").trim() || parentLabel.textContent.trim();
    }

    // 3. aria-label / title
    const aria = inputEl.getAttribute("aria-label") || inputEl.getAttribute("title");
    if (aria && aria.trim()) return aria.trim();

    // 4. Next sibling text / span
    let sibling = inputEl.nextElementSibling;
    while (sibling) {
      if (sibling.tagName === "LABEL" || sibling.tagName === "SPAN" || sibling.tagName === "B") {
        const txt = sibling.textContent.trim();
        if (txt) return txt;
      }
      sibling = sibling.nextElementSibling;
    }

    // 5. Value attribute if informative
    if (inputEl.value && !inputEl.value.startsWith("ctl00") && inputEl.value.length < 20) {
      return inputEl.value;
    }

    // 6. Fallback index
    return fallbackIndex !== null ? String(fallbackIndex + 1) : "";
  }

  /**
   * Strategy 1: Table Matrix Parsing (Classic ERP / CUIMS ASP.NET tables)
   */
  function parseTableMatrix(container) {
    const questions = [];
    const tables = Array.from(container.querySelectorAll("table"));

    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll("tr"));
      if (rows.length < 2) continue;

      // Extract column headers if available (e.g., [S.No, Question, Poor, Average, Good, Very Good, Excellent])
      let columnHeaders = [];
      const headerRow = table.querySelector("thead tr") || rows[0];
      if (headerRow) {
        columnHeaders = Array.from(headerRow.querySelectorAll("th, td")).map((c) => c.textContent.trim());
      }

      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = rows[rIdx];
        if (row === headerRow) continue;

        const cells = Array.from(row.querySelectorAll("td, th"));
        if (cells.length < 2) continue;

        const radios = Array.from(row.querySelectorAll('input[type="radio"]'));
        const selects = Array.from(row.querySelectorAll("select"));
        const textInputs = Array.from(row.querySelectorAll("textarea, input[type='text']"));

        if (radios.length === 0 && selects.length === 0 && textInputs.length === 0) {
          continue; // Likely header or spacer row
        }

        // Identify question cell: usually first cell with substantial text
        let questionCell = null;
        for (const cell of cells) {
          if (cell.querySelectorAll('input[type="radio"], select').length === 0 && cell.textContent.trim().length > 3) {
            questionCell = cell;
            break;
          }
        }

        const rawText = questionCell ? questionCell.textContent.trim() : `Question in row ${rIdx}`;
        const questionText = cleanQuestionText(rawText);
        const required = isRequired(row, rawText);

        if (radios.length > 0) {
          const options = radios.map((radio, idx) => {
            // Find label from cell or column header
            const parentCell = radio.closest("td");
            let label = "";
            if (parentCell) {
              const cellIndex = cells.indexOf(parentCell);
              if (columnHeaders[cellIndex]) {
                label = columnHeaders[cellIndex];
              }
            }
            if (!label) {
              label = findOptionLabel(radio, idx);
            }

            const numVal = parseInt(radio.value || label, 10);
            return {
              label: label || `Option ${idx + 1}`,
              value: radio.value || String(idx + 1),
              element: radio,
              numericValue: !isNaN(numVal) ? numVal : idx + 1
            };
          });

          // Check if this is a rating question (1..5 or 1..10)
          const isNumericRating = options.every((opt) => /^\d+$/.test(opt.label.trim()) || opt.numericValue !== null);

          questions.push({
            id: `table_q_${questions.length + 1}`,
            questionText,
            rawText,
            type: isNumericRating ? "rating" : "radio",
            required,
            containerElement: row,
            options,
            inputElement: null
          });
        } else if (selects.length > 0) {
          const select = selects[0];
          const options = Array.from(select.options)
            .filter((opt) => opt.value !== "" && !opt.disabled)
            .map((opt, idx) => {
              const numVal = parseInt(opt.value || opt.text, 10);
              return {
                label: opt.text.trim(),
                value: opt.value,
                element: opt,
                numericValue: !isNaN(numVal) ? numVal : null
              };
            });

          questions.push({
            id: `table_select_${questions.length + 1}`,
            questionText,
            rawText,
            type: "select",
            required: required || select.hasAttribute("required"),
            containerElement: row,
            options,
            inputElement: select
          });
        } else if (textInputs.length > 0) {
          const input = textInputs[0];
          questions.push({
            id: `table_text_${questions.length + 1}`,
            questionText,
            rawText,
            type: input.tagName === "TEXTAREA" ? "textarea" : "text",
            required: required || input.hasAttribute("required"),
            containerElement: row,
            options: [],
            inputElement: input
          });
        }
      }
    }

    return questions;
  }

  /**
   * Strategy 2: Card / Fieldset / Form-group Parsing
   */
  function parseContainerGroups(container, alreadyParsedElements) {
    const questions = [];
    const groupSelectors = [
      ".form-group",
      ".question-block",
      ".question-row",
      ".feedback-item",
      ".survey-question",
      "fieldset",
      ".card",
      ".panel"
    ];

    const candidateGroups = Array.from(container.querySelectorAll(groupSelectors.join(", ")));

    for (const group of candidateGroups) {
      if (alreadyParsedElements.has(group)) continue;

      // Extract question title
      const titleEl = group.querySelector("legend, label.control-label, .question-title, h4, h5, h6, strong, b, .title");
      let rawText = titleEl ? titleEl.textContent.trim() : "";
      if (!rawText) {
        // Fallback: take leading text node
        const firstLabel = group.querySelector("label");
        if (firstLabel && firstLabel.querySelectorAll('input[type="radio"], input[type="checkbox"]').length === 0) {
          rawText = firstLabel.textContent.trim();
        }
      }

      const radios = Array.from(group.querySelectorAll('input[type="radio"]'));
      const selects = Array.from(group.querySelectorAll("select"));
      const textareas = Array.from(group.querySelectorAll("textarea"));
      const textInputs = Array.from(group.querySelectorAll('input[type="text"]:not([readonly])'));
      const checkboxes = Array.from(group.querySelectorAll('input[type="checkbox"]'));
      const starButtons = Array.from(group.querySelectorAll('[class*="star" i], [class*="rating-star" i], button[data-rating]'));

      if (!radios.length && !selects.length && !textareas.length && !textInputs.length && !checkboxes.length && !starButtons.length) {
        continue;
      }

      alreadyParsedElements.add(group);
      const questionText = cleanQuestionText(rawText);
      const required = isRequired(group, rawText);

      if (radios.length > 0) {
        const options = radios.map((radio, idx) => {
          const label = findOptionLabel(radio, idx);
          const numVal = parseInt(radio.value || label, 10);
          return {
            label,
            value: radio.value,
            element: radio,
            numericValue: !isNaN(numVal) ? numVal : idx + 1
          };
        });

        questions.push({
          id: `group_radio_${questions.length + 1}`,
          questionText,
          rawText,
          type: options.every((o) => /^\d+$/.test(o.label)) ? "rating" : "radio",
          required,
          containerElement: group,
          options,
          inputElement: null
        });
      } else if (selects.length > 0) {
        const select = selects[0];
        const options = Array.from(select.options)
          .filter((opt) => opt.value !== "" && !opt.disabled)
          .map((opt) => ({
            label: opt.text.trim(),
            value: opt.value,
            element: opt,
            numericValue: !isNaN(parseInt(opt.value, 10)) ? parseInt(opt.value, 10) : null
          }));

        questions.push({
          id: `group_select_${questions.length + 1}`,
          questionText,
          rawText,
          type: "select",
          required: required || select.hasAttribute("required"),
          containerElement: group,
          options,
          inputElement: select
        });
      } else if (textareas.length > 0) {
        questions.push({
          id: `group_textarea_${questions.length + 1}`,
          questionText,
          rawText,
          type: "textarea",
          required: required || textareas[0].hasAttribute("required"),
          containerElement: group,
          options: [],
          inputElement: textareas[0]
        });
      } else if (textInputs.length > 0) {
        questions.push({
          id: `group_text_${questions.length + 1}`,
          questionText,
          rawText,
          type: "text",
          required: required || textInputs[0].hasAttribute("required"),
          containerElement: group,
          options: [],
          inputElement: textInputs[0]
        });
      } else if (starButtons.length > 0) {
        const options = starButtons.map((btn, idx) => {
          const ratingVal = btn.getAttribute("data-rating") || btn.getAttribute("aria-label") || String(idx + 1);
          return {
            label: `${ratingVal} Stars`,
            value: ratingVal,
            element: btn,
            numericValue: parseInt(ratingVal, 10) || idx + 1
          };
        });

        questions.push({
          id: `group_star_${questions.length + 1}`,
          questionText,
          rawText,
          type: "rating",
          required,
          containerElement: group,
          options,
          inputElement: null
        });
      } else if (checkboxes.length > 0) {
        questions.push({
          id: `group_checkbox_${questions.length + 1}`,
          questionText,
          rawText,
          type: "checkbox",
          required,
          containerElement: group,
          options: [],
          inputElement: checkboxes[0]
        });
      }
    }

    return questions;
  }

  /**
   * Strategy 3: Loose / Orphaned Input Gathering
   * Groups any remaining radios by name or loose text inputs not caught by table or containers.
   */
  function parseLooseElements(container, handledElements) {
    const questions = [];

    // Group remaining radio inputs by name
    const allRadios = Array.from(container.querySelectorAll('input[type="radio"]'));
    const unhandledRadios = allRadios.filter((r) => !handledElements.has(r));

    const radioGroupsByName = new Map();
    for (const radio of unhandledRadios) {
      const name = radio.name || "unnamed_group";
      if (!radioGroupsByName.has(name)) {
        radioGroupsByName.set(name, []);
      }
      radioGroupsByName.get(name).push(radio);
    }

    for (const [groupName, radios] of radioGroupsByName.entries()) {
      // Find common ancestor to look for question label
      let commonParent = radios[0].parentElement;
      for (let i = 0; i < 4 && commonParent && commonParent !== container; i++) {
        if (radios.every((r) => commonParent.contains(r))) {
          break;
        }
        commonParent = commonParent.parentElement;
      }

      let rawText = "";
      if (commonParent) {
        const titleEl = commonParent.querySelector("label, h4, h5, legend, b, strong");
        if (titleEl) rawText = titleEl.textContent.trim();
      }
      if (!rawText) rawText = groupName;

      const questionText = cleanQuestionText(rawText);
      const options = radios.map((radio, idx) => {
        handledElements.add(radio);
        const label = findOptionLabel(radio, idx);
        const numVal = parseInt(radio.value || label, 10);
        return {
          label,
          value: radio.value,
          element: radio,
          numericValue: !isNaN(numVal) ? numVal : idx + 1
        };
      });

      questions.push({
        id: `loose_radio_${questions.length + 1}`,
        questionText,
        rawText,
        type: options.every((o) => /^\d+$/.test(o.label)) ? "rating" : "radio",
        required: isRequired(radios[0], rawText),
        containerElement: commonParent || radios[0].parentElement,
        options,
        inputElement: null
      });
    }

    // Remaining textareas
    const allTextareas = Array.from(container.querySelectorAll("textarea"));
    for (const ta of allTextareas) {
      if (handledElements.has(ta)) continue;
      handledElements.add(ta);
      const label = findOptionLabel(ta) || ta.placeholder || "Remarks / Suggestions";
      questions.push({
        id: `loose_textarea_${questions.length + 1}`,
        questionText: cleanQuestionText(label),
        rawText: label,
        type: "textarea",
        required: isRequired(ta, label),
        containerElement: ta.parentElement,
        options: [],
        inputElement: ta
      });
    }

    return questions;
  }

  /**
   * Main parsing function
   */
  function parseFeedbackForm(container) {
    if (!container) return [];

    const handledElements = new Set();
    const allQuestions = [];

    // 1. Check Table Matrix first (dominant pattern on CUIMS)
    const tableQuestions = parseTableMatrix(container);
    for (const q of tableQuestions) {
      allQuestions.push(q);
      if (q.containerElement) handledElements.add(q.containerElement);
      if (q.options) q.options.forEach((o) => handledElements.add(o.element));
      if (q.inputElement) handledElements.add(q.inputElement);
    }

    // 2. Check Form Groups & Fieldsets
    const groupQuestions = parseContainerGroups(container, handledElements);
    for (const q of groupQuestions) {
      allQuestions.push(q);
      if (q.options) q.options.forEach((o) => handledElements.add(o.element));
      if (q.inputElement) handledElements.add(q.inputElement);
    }

    // 3. Collect any remaining loose inputs
    const looseQuestions = parseLooseElements(container, handledElements);
    for (const q of looseQuestions) {
      allQuestions.push(q);
    }

    return allQuestions;
  }

  return {
    parseFeedbackForm,
    cleanQuestionText,
    isRequired
  };
});
