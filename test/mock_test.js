/**
 * Standalone Unit Verification for AnswerEngine and Configuration Rules
 */

const { DEFAULT_CONFIG, QUESTION_RULES } = require("../config.js");
const AnswerEngine = require("../utils/answerEngine.js");

console.log("=== RUNNING CUIMS AUTO FEEDBACK LOGIC TESTS ===");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

// Test 1: Punctuality question matching
const q1 = {
  id: "q1",
  questionText: "Punctuality and regularity of the faculty in taking classes",
  type: "rating",
  options: [
    { label: "1", value: "1", numericValue: 1 },
    { label: "2", value: "2", numericValue: 2 },
    { label: "3", value: "3", numericValue: 3 },
    { label: "4", value: "4", numericValue: 4 },
    { label: "5", value: "5", numericValue: 5 }
  ]
};

const d1 = AnswerEngine.determineAnswer(q1, DEFAULT_CONFIG, QUESTION_RULES);
assert(d1.targetOption && d1.targetOption.numericValue === 5, "Punctuality maps to highest rating (5)");
assert(d1.ruleMatched === "punctual", "Punctuality matches 'punctual' keyword rule");

// Test 2: Infrastructure question matching (mapped to 4 / Very Good)
const q2 = {
  id: "q2",
  questionText: "Quality of laboratory infrastructure and computer lab equipment",
  type: "rating",
  options: [
    { label: "1", value: "1", numericValue: 1 },
    { label: "2", value: "2", numericValue: 2 },
    { label: "3", value: "3", numericValue: 3 },
    { label: "4", value: "4", numericValue: 4 },
    { label: "5", value: "5", numericValue: 5 }
  ]
};

const d2 = AnswerEngine.determineAnswer(q2, DEFAULT_CONFIG, QUESTION_RULES);
assert(d2.targetOption && d2.targetOption.numericValue === 4, "Infrastructure question maps to rating 4 ('Very Good')");

// Test 3: Dropdown selection matching
const q3 = {
  id: "q3",
  questionText: "Overall satisfaction with library learning resources and digital portal",
  type: "select",
  options: [
    { label: "Poor", value: "Poor" },
    { label: "Average", value: "Average" },
    { label: "Good", value: "Good" },
    { label: "Very Good", value: "Very Good" },
    { label: "Excellent", value: "Excellent" }
  ]
};

const d3 = AnswerEngine.determineAnswer(q3, DEFAULT_CONFIG, QUESTION_RULES);
assert(d3.targetOption && d3.targetOption.value === "Excellent", "Library dropdown maps to 'Excellent'");

// Test 4: Agreement scale matching (e.g. Strongly Disagree to Strongly Agree)
const q4 = {
  id: "q4",
  questionText: "The instructor explained all concepts clearly",
  type: "radio",
  options: [
    { label: "Strongly Disagree", value: "SD" },
    { label: "Disagree", value: "D" },
    { label: "Neutral", value: "N" },
    { label: "Agree", value: "A" },
    { label: "Strongly Agree", value: "SA" }
  ]
};

const d4 = AnswerEngine.determineAnswer(q4, DEFAULT_CONFIG, QUESTION_RULES);
assert(d4.targetOption && d4.targetOption.label === "Strongly Agree", "Agreement scale maps to 'Strongly Agree' for Excellent target");

// Test 5: Text response matching
const q5 = {
  id: "q5",
  questionText: "Any remarks or suggestions for improvements",
  type: "textarea",
  options: []
};

const d5 = AnswerEngine.determineAnswer(q5, DEFAULT_CONFIG, QUESTION_RULES);
assert(typeof d5.valueToSet === "string" && d5.valueToSet.length > 0, "Textarea receives structured response");

// Test 6: Context-Aware Fingerprinting (Distinguishing identical questions for different teachers)
const SubmitVerifier = require("../utils/submitVerifier.js");
const identicalQuestions = [q1, q2, q3];
const fpTeacher1 = SubmitVerifier.generateFormFingerprint(identicalQuestions, "https://uims.cuchd.in/UIMS/frmFeedback.aspx", "Dr. Sharma (Data Structures)");
const fpTeacher2 = SubmitVerifier.generateFormFingerprint(identicalQuestions, "https://uims.cuchd.in/UIMS/frmFeedback.aspx", "Prof. Verma (Web Development)");
assert(fpTeacher1 !== fpTeacher2, "Different teachers with identical questions produce distinct fingerprints");

// Test 7: Performance configuration defaults
assert(DEFAULT_CONFIG.typingDelayMs <= 5, "typingDelayMs is set for snappy input (< 5ms)");
assert(DEFAULT_CONFIG.detectionDelayMs <= 300, "detectionDelayMs is set for fast detection (<= 300ms)");
assert(DEFAULT_CONFIG.multiFormIntervalMs >= 200, "multiFormIntervalMs exists to space out ASP.NET submissions");

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
