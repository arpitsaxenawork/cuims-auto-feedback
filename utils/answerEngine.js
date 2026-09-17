/**
 * CUIMS Auto Feedback - Answer Engine Module
 * Determines answers using keyword rules, fuzzy sentiment matching, and default configs.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CUIMS_AnswerEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  // Sentiment rank tables for common rating scales
  // Highest index = most positive
  const SCALE_TIERS = [
    // 5-level agreement
    ["strongly disagree", "disagree", "neutral", "agree", "strongly agree"],
    // 5-level quality
    ["poor", "below average", "average", "good", "very good", "excellent"],
    // 4-level quality
    ["unsatisfactory", "satisfactory", "good", "excellent"],
    // Frequency
    ["never", "rarely", "sometimes", "mostly", "always"],
    // Binary
    ["no", "yes"]
  ];

  /**
   * Normalizes strings for matching
   */
  function clean(str) {
    return (str || "").toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  }

  /**
   * Matches question text against question rules
   */
  function findMatchingRule(questionText, rules = []) {
    const qClean = clean(questionText);
    const qWords = new Set(qClean.split(" "));

    for (const rule of rules) {
      if (!rule.keywords || !Array.isArray(rule.keywords)) continue;
      for (const kw of rule.keywords) {
        const kwClean = clean(kw);
        // Check exact word or phrase inclusion
        if (qClean.includes(kwClean) || qWords.has(kwClean)) {
          return rule;
        }
      }
    }
    return null;
  }

  /**
   * Finds the best matching option for a given target label or rating
   */
  function resolveBestOption(options, targetAnswer, targetRating = 5) {
    if (!options || options.length === 0) return null;

    const targetStr = clean(String(targetAnswer || ""));

    // 1. Direct label or value exact match
    for (const opt of options) {
      const optLabel = clean(opt.label);
      const optVal = clean(opt.value);
      if (optLabel === targetStr || optVal === targetStr) {
        return opt;
      }
    }

    // 2. Direct substring match (e.g. "5 - Excellent" or "Excellent (100%)")
    for (const opt of options) {
      const optLabel = clean(opt.label);
      if (optLabel.includes(targetStr) || (targetStr && targetStr.includes(optLabel))) {
        return opt;
      }
    }

    // 3. Numeric rating match (e.g. looking for 5 in options [1, 2, 3, 4, 5])
    if (targetRating !== null) {
      for (const opt of options) {
        if (opt.numericValue === targetRating) {
          return opt;
        }
        if (clean(opt.label) === String(targetRating) || clean(opt.value) === String(targetRating)) {
          return opt;
        }
      }

      // If options actually have valid numeric values, pick max option
      const numericOpts = options.filter((o) => typeof o.numericValue === "number" && !isNaN(o.numericValue));
      if (numericOpts.length > 0) {
        numericOpts.sort((a, b) => (b.numericValue || 0) - (a.numericValue || 0));
        return numericOpts[0];
      }
    }

    // 4. Semantic Scale / Tier matching
    // E.g., if target is "Excellent" or rating 5, and scale is ["Poor", "Average", "Good", "Very Good", "Excellent"]
    // or ["Strongly Disagree", ..., "Strongly Agree"]
    for (const tier of SCALE_TIERS) {
      // Find if options match this tier
      const mappedOptions = options.map((opt) => {
        const optText = clean(opt.label || opt.value);
        // Find exact match first, or longest matching token in tier
        let bestIdx = -1;
        let bestMatchLen = 0;
        for (let tIdx = 0; tIdx < tier.length; tIdx++) {
          const t = tier[tIdx];
          if (optText === t) {
            bestIdx = tIdx;
            bestMatchLen = 999;
            break;
          }
          if (optText.includes(t) && t.length > bestMatchLen) {
            bestIdx = tIdx;
            bestMatchLen = t.length;
          }
        }
        return { opt, tierIndex: bestIdx };
      });

      const matchedTierCount = mappedOptions.filter((m) => m.tierIndex !== -1).length;
      if (matchedTierCount >= 2) {
        // This tier applies!
        const matchIndexInTier = tier.findIndex((t) => targetStr === t || targetStr.includes(t) || t.includes(targetStr));

        let idealTierIndex = -1;
        if (matchIndexInTier !== -1) {
          idealTierIndex = matchIndexInTier;
        } else if (targetRating !== null) {
          // Map 1..5 scale to tier scale
          const ratio = Math.max(0, Math.min(1, (targetRating - 1) / 4));
          idealTierIndex = Math.round(ratio * (tier.length - 1));
        } else {
          idealTierIndex = tier.length - 1;
        }

        // Find option with closest tier index
        let closest = null;
        let minDiff = Infinity;
        for (const m of mappedOptions) {
          if (m.tierIndex === -1) continue;
          const diff = Math.abs(m.tierIndex - idealTierIndex);
          if (diff < minDiff) {
            minDiff = diff;
            closest = m.opt;
          }
        }
        if (closest) return closest;
      }
    }

    // 5. Fallback: Last option if ordered Poor -> Excellent, or First option if Excellent -> Poor
    // Check if options have numeric progression
    const firstOptNum = parseInt(options[0].label || options[0].value, 10);
    const lastOptNum = parseInt(options[options.length - 1].label || options[options.length - 1].value, 10);
    if (!isNaN(firstOptNum) && !isNaN(lastOptNum)) {
      return lastOptNum > firstOptNum ? options[options.length - 1] : options[0];
    }

    // Default to last option (conventionally standard for positive scale like 1..5, Poor..Excellent)
    return options[options.length - 1];
  }

  /**
   * Computes the decision for a parsed question
   */
  function determineAnswer(question, config = {}, rules = []) {
    const matchedRule = findMatchingRule(question.questionText, rules);

    const targetRating = matchedRule && matchedRule.rating ? matchedRule.rating : (config.rating || config.defaultRating || 5);
    const targetLabel = matchedRule && matchedRule.answer ? matchedRule.answer : (config.dropdownDefault || "Excellent");
    const targetText = matchedRule && matchedRule.text ? matchedRule.text : (config.textResponse || "Good");

    let decision = {
      type: question.type,
      questionId: question.id,
      ruleMatched: matchedRule ? matchedRule.keywords[0] : null,
      targetOption: null,
      valueToSet: null
    };

    switch (question.type) {
      case "rating":
      case "radio": {
        const bestOpt = resolveBestOption(question.options, targetLabel, targetRating);
        decision.targetOption = bestOpt;
        decision.valueToSet = bestOpt ? bestOpt.value : null;
        break;
      }

      case "select": {
        const bestOpt = resolveBestOption(question.options, targetLabel, targetRating);
        decision.targetOption = bestOpt;
        decision.valueToSet = bestOpt ? bestOpt.value : null;
        break;
      }

      case "textarea":
      case "text": {
        decision.valueToSet = targetText;
        break;
      }

      case "checkbox": {
        decision.valueToSet = config.checkboxDefault !== false;
        break;
      }

      default: {
        // Unknown type: log and avoid random filling
        decision.unknownType = true;
        break;
      }
    }

    return decision;
  }

  return {
    determineAnswer,
    findMatchingRule,
    resolveBestOption,
    SCALE_TIERS
  };
});
