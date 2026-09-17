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
  detectionDelayMs: 200,
  typingDelayMs: 2,
  multiFormIntervalMs: 350,
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
  const tabId = sender?.tab?.id;

  if (message.action === "SUBMISSION_PROGRESS" && tabId) {
    console.log(`[CUIMS Auto Feedback Background] Progress for tab ${tabId}: ${message.current}/${message.total}`);
    chrome.action.setBadgeText({ tabId, text: `${message.current}/${message.total}` });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#f59e0b" }); // Amber progress
    sendResponse({ acknowledged: true });
  } else if ((message.action === "ALL_COMPLETED" || message.action === "SUBMISSION_COMPLETED") && tabId) {
    console.log("[CUIMS Auto Feedback Background] All submissions completed for tab:", tabId);
    chrome.action.setBadgeText({ tabId, text: "DONE" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#3b82f6" }); // Blue done

    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: "ON" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#10b981" });
    }, 5000);

    sendResponse({ acknowledged: true });
  }
  return true;
});
