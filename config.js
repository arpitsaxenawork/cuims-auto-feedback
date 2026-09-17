/**
 * CUIMS Auto Feedback - Configuration & Rules
 * Manifest V3 compatible
 */

const DEFAULT_CONFIG = {
  enabled: true,
  autoSubmit: true,
  rating: 5,
  defaultRating: 5,
  textResponse: "Good",
  dropdownDefault: "Excellent",
  checkboxDefault: true,
  detectionDelayMs: 200,
  typingDelayMs: 2,
  multiFormIntervalMs: 350,
  duplicateWindowMinutes: 60,
  logPrefix: "[CUIMS Auto Feedback]"
};

// Keyword rules for matching specific questions to tailored responses
// Evaluated in order of appearance (case-insensitive)
const QUESTION_RULES = [
  {
    keywords: ["punctual", "regularity", "attendance", "discipline", "time"],
    answer: "Excellent",
    rating: 5,
    text: "Classes and practical sessions are conducted strictly on schedule."
  },
  {
    keywords: ["infrastructure", "classroom", "lab", "laboratory", "equipment", "hardware", "facility"],
    answer: "Very Good",
    rating: 4,
    text: "Classroom and laboratory facilities are well equipped and properly maintained."
  },
  {
    keywords: ["library", "book", "journal", "reading", "resource"],
    answer: "Excellent",
    rating: 5,
    text: "Extensive library collection and digital learning resources available."
  },
  {
    keywords: ["evaluation", "exam", "assessment", "fairness", "test", "grading", "marks"],
    answer: "Excellent",
    rating: 5,
    text: "Evaluation and assessments are fair, timely, and transparent."
  },
  {
    keywords: ["course", "content", "syllabus", "curriculum", "material", "subject"],
    answer: "Excellent",
    rating: 5,
    text: "Course content is well-structured, modern, and aligned with industry standards."
  },
  {
    keywords: ["faculty", "teacher", "teaching", "instructor", "professor", "knowledge", "delivery"],
    answer: "Excellent",
    rating: 5,
    text: "Faculty is very knowledgeable, helpful, and explains concepts thoroughly."
  },
  {
    keywords: ["suggestion", "remark", "feedback", "comment", "improvement", "scope"],
    answer: "Good",
    rating: 5,
    text: "Keep up the great work. No major changes required."
  }
];

// Asynchronous config loader with storage sync fallback
async function getActiveConfig() {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(DEFAULT_CONFIG, (items) => {
        resolve({ ...DEFAULT_CONFIG, ...items });
      });
    } else if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(DEFAULT_CONFIG, (items) => {
        resolve({ ...DEFAULT_CONFIG, ...items });
      });
    } else {
      resolve({ ...DEFAULT_CONFIG });
    }
  });
}

// Expose globally for content scripts and test environments
if (typeof window !== "undefined") {
  window.CUIMS_CONFIG = DEFAULT_CONFIG;
  window.CUIMS_QUESTION_RULES = QUESTION_RULES;
  window.getActiveConfig = getActiveConfig;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULT_CONFIG,
    QUESTION_RULES,
    getActiveConfig
  };
}
