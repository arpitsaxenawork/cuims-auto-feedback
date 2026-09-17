/**
 * CUIMS Auto Feedback - Background Service Worker (Manifest V3)
 */

const DEFAULT_SETTINGS = {
  enabled: true,
  autoSubmit: true,
  rating: 5,
  defaultRating: 5,
  textResponse: "Good",
  dropdownDefault: "Excellent",
  checkboxDefault: true,
  detectionDelayMs: 600,
  typingDelayMs: 15,
  duplicateWindowMinutes: 60
};

// Initialize settings on install
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[CUIMS Auto Feedback Background] Installed/Updated:", details.reason);

  chrome.storage.sync.get(DEFAULT_SETTINGS, (current) => {
    chrome.storage.sync.set({ ...DEFAULT_SETTINGS, ...current });
  });

  // Set default badge
  chrome.action.setBadgeText({ text: "ON" });
  chrome.action.setBadgeBackgroundColor({ color: "#10b981" }); // Emerald green
});

// Message listener for content script submissions
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "SUBMISSION_COMPLETED") {
    console.log("[CUIMS Auto Feedback Background] Submission verified for tab:", sender?.tab?.id);

    // Show temporary checkmark badge on active tab
    if (sender?.tab?.id) {
      chrome.action.setBadgeText({ tabId: sender.tab.id, text: "DONE" });
      chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: "#3b82f6" });

      setTimeout(() => {
        chrome.action.setBadgeText({ tabId: sender.tab.id, text: "ON" });
        chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: "#10b981" });
      }, 5000);
    }

    sendResponse({ acknowledged: true });
  }
  return true;
});
