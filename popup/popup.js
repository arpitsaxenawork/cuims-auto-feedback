/**
 * CUIMS Auto Feedback - Popup Logic
 * Handles configuration persistence, live status synchronization, and manual triggers.
 */

document.addEventListener("DOMContentLoaded", async () => {
  // Elements
  const enableToggle = document.getElementById("enableToggle");
  const autoSubmitToggle = document.getElementById("autoSubmitToggle");
  const defaultRating = document.getElementById("defaultRating");
  const ratingDisplay = document.getElementById("ratingDisplay");
  const dropdownDefault = document.getElementById("dropdownDefault");
  const textResponse = document.getElementById("textResponse");

  const statusBadge = document.getElementById("statusBadge");
  const statusText = document.getElementById("statusText");

  const lastFormDetected = document.getElementById("lastFormDetected");
  const lastSubmissionStatus = document.getElementById("lastSubmissionStatus");
  const lastSubmissionTime = document.getElementById("lastSubmissionTime");
  const errorBox = document.getElementById("errorBox");
  const errorMessage = document.getElementById("errorMessage");

  const btnTestNow = document.getElementById("btnTestNow");
  const btnResetHistory = document.getElementById("btnResetHistory");

  // Load stored settings
  const config = await getStoredConfig();
  updateUIFromConfig(config);

  // Load telemetry / diagnostics
  refreshDiagnostics();

  // Event Listeners for controls
  enableToggle.addEventListener("change", () => {
    saveConfigKey("enabled", enableToggle.checked);
    updateStatusBadge(enableToggle.checked);
  });

  autoSubmitToggle.addEventListener("change", () => {
    saveConfigKey("autoSubmit", autoSubmitToggle.checked);
  });

  defaultRating.addEventListener("input", () => {
    ratingDisplay.textContent = `${defaultRating.value} ★`;
    saveConfigKey("defaultRating", parseInt(defaultRating.value, 10));
    saveConfigKey("rating", parseInt(defaultRating.value, 10));
  });

  dropdownDefault.addEventListener("change", () => {
    saveConfigKey("dropdownDefault", dropdownDefault.value);
  });

  textResponse.addEventListener("input", () => {
    saveConfigKey("textResponse", textResponse.value);
  });

  // Action: Test / Fill Current Page
  btnTestNow.addEventListener("click", async () => {
    btnTestNow.disabled = true;
    btnTestNow.innerText = "⏳ Scanning & Filling...";

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        showError("No active browser tab found.");
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: "MANUAL_TRIGGER" }, (response) => {
        btnTestNow.disabled = false;
        btnTestNow.innerText = "⚡ Test / Fill Current Page";

        if (chrome.runtime.lastError) {
          showError("Content script not active on this page. Refresh the page or check URL permissions.");
        } else {
          setTimeout(refreshDiagnostics, 500);
        }
      });
    } catch (err) {
      btnTestNow.disabled = false;
      btnTestNow.innerText = "⚡ Test / Fill Current Page";
      showError(err.message);
    }
  });

  // Action: Reset History
  btnResetHistory.addEventListener("click", () => {
    chrome.storage.local.set({ submissionHistory: {}, lastSubmission: null }, () => {
      btnResetHistory.innerText = "✓ History Cleared";
      setTimeout(() => {
        btnResetHistory.innerText = "🔄 Reset Submission History";
      }, 1500);
      refreshDiagnostics();
    });
  });

  /**
   * Helpers
   */
  function updateUIFromConfig(cfg) {
    enableToggle.checked = cfg.enabled !== false;
    autoSubmitToggle.checked = cfg.autoSubmit !== false;
    defaultRating.value = cfg.defaultRating || cfg.rating || 5;
    ratingDisplay.textContent = `${defaultRating.value} ★`;
    dropdownDefault.value = cfg.dropdownDefault || "Excellent";
    textResponse.value = cfg.textResponse || "Good";

    updateStatusBadge(cfg.enabled !== false);
  }

  function updateStatusBadge(isActive) {
    if (isActive) {
      statusBadge.className = "badge badge-active";
      statusText.textContent = "Active";
    } else {
      statusBadge.className = "badge badge-inactive";
      statusText.textContent = "Disabled";
    }
  }

  function saveConfigKey(key, value) {
    const update = {};
    update[key] = value;
    chrome.storage.sync.set(update);
  }

  async function getStoredConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        {
          enabled: true,
          autoSubmit: true,
          rating: 5,
          defaultRating: 5,
          textResponse: "Good",
          dropdownDefault: "Excellent"
        },
        (res) => resolve(res)
      );
    });
  }

  function refreshDiagnostics() {
    chrome.storage.local.get(["liveStatus", "lastSubmission"], (data) => {
      const live = data.liveStatus;
      const sub = data.lastSubmission;

      if (live) {
        lastFormDetected.textContent = live.status === "NO_FORM_DETECTED" ? "None detected" : "Detected";
        if (live.status === "ERROR" || live.status === "VALIDATION_FAILED") {
          showError(live.message);
        } else {
          hideError();
        }
      }

      if (sub) {
        lastSubmissionStatus.textContent = sub.status;
        lastSubmissionStatus.className =
          sub.status === "SUCCESS" ? "diag-val diag-success" : "diag-val";
        lastSubmissionTime.textContent = sub.time || "--:--";
      } else {
        lastSubmissionStatus.textContent = "Idle";
        lastSubmissionStatus.className = "diag-val diag-idle";
        lastSubmissionTime.textContent = "--:--";
      }
    });
  }

  function showError(msg) {
    errorBox.style.display = "flex";
    errorMessage.textContent = msg;
  }

  function hideError() {
    errorBox.style.display = "none";
  }
});
