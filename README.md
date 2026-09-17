# CUIMS Auto Feedback Chrome Extension (Manifest V3)

A fast, intelligent, and zero-configuration Chrome Extension that automatically detects, fills, and submits post-login feedback forms on Chandigarh University's Information Management System (**CUIMS / UIMS**: `uims.cuchd.in` and `cuims.in`).

---

## Features

- ⚡ **Completely Hands-Free**: Runs quietly in the background using `MutationObserver`. You do not need to click anything after logging into CUIMS.
- 🛡️ **Zero Fragile Selectors**: Uses semantic detection (table matrices, question text, input groupings, keyword density) rather than brittle IDs or classes.
- 🎯 **Question-Aware Rules**: Intelligently matches questions:
  - Faculty / Teaching $\rightarrow$ `Excellent` / `5`
  - Course content & Syllabus $\rightarrow$ `Excellent` / `5`
  - Laboratory & Infrastructure $\rightarrow$ `Very Good` / `4` or `5`
  - Library & Digital Resources $\rightarrow$ `Excellent` / `5`
  - Examination & Evaluation $\rightarrow$ `Excellent` / `5`
  - Custom fallback options for all other questions.
- 🎛️ **Modern Popup Dashboard**: Toggle Auto-Fill / Auto-Submit, customize ratings and remarks, view real-time diagnostics, or trigger manual test fills.
- 🔒 **Duplicate Protection**: Uses form fingerprint hashing in `chrome.storage.local` to prevent resubmitting the same form repeatedly.
- 🔐 **100% Private & Secure**: Operates strictly client-side. Never reads passwords, credentials, marks, or attendance, and makes zero external network calls.

---

## How to Install (Chrome / Brave / Edge)

### Option 1: Quick Install via Release (Recommended for students)
1. Go to the [Releases](https://github.com/) tab on this repository and download the latest **`cuims-auto-feedback-v1.0.1.zip`**.
2. Unzip/extract the downloaded archive to a folder on your computer.
3. Open your browser and navigate to the extensions page:
   - **Chrome**: `chrome://extensions/`
   - **Brave**: `brave://extensions/`
   - **Edge**: `edge://extensions/`
4. Turn **ON** the **Developer mode** toggle (usually in the top-right corner).
5. Click the **Load unpacked** button.
6. Select the unzipped folder containing `manifest.json`.
7. Done! Pin **CUIMS Auto Feedback** to your browser toolbar for easy access.

### Option 2: Clone from Source
```bash
git clone https://github.com/arpitsaxenawork/cuims-auto-feedback.git
```
Then follow steps 3–6 above selecting the cloned repository folder.

---

## How to Use on CUIMS

1. Log into your CUIMS portal ([uims.cuchd.in](https://uims.cuchd.in/) or `cuims.in`) as usual.
2. Whenever a feedback form or popup modal appears:
   - The extension automatically detects the form.
   - It reads all questions, ratings, radio buttons, dropdowns, and text fields.
   - It fills every required field according to your rules.
   - If **Auto-Submit** is enabled, it verifies completeness and clicks the **Submit** button automatically.
   - You will see the submission confirmation on the page and the extension badge will show `DONE`.
3. If no feedback form is present, the extension remains completely passive and will never interfere with normal browsing or login fields.

---

## How to Test It Locally (Simulator)

You don't need to wait for an actual feedback cycle on CUIMS to verify the extension. A realistic CUIMS feedback simulation page is included in this repository.

1. Open Google Chrome.
2. Press `Ctrl + O` (or drag and drop into Chrome) to open:
   ```text
   C:\Users\arpit\OneDrive\Documents\code\feedback cuims\test\mock_cuims_feedback.html
   ```
3. Click the extension icon in your Chrome toolbar:
   - Click **⚡ Test / Fill Current Page**.
   - Watch the form automatically fill all table rows, select the dropdown, fill the remarks, and trigger submission!
4. To test again, click **🔄 Reset Submission History** in the popup to clear the duplicate submission guard.

---

## Customizing Your Preferred Answers

### Method 1: Using the Popup Dashboard
Click the extension icon in Chrome to:
- Adjust the **Default Rating** slider (1 to 5 ★).
- Change the **Default Scale / Dropdown** (`Excellent`, `Very Good`, `Good`, `Strongly Agree`, `Agree`).
- Edit the **Default Text Remark** (e.g. "Excellent teaching and course delivery.").
- Toggle **Auto-Submit** ON or OFF (turning it OFF allows you to review filled answers before submitting manually).

### Method 2: Customizing Rules in `config.js`
Open `config.js` in your editor to modify or add question keywords:

```javascript
const QUESTION_RULES = [
  {
    keywords: ["faculty", "teacher", "teaching"],
    answer: "Excellent",
    rating: 5,
    text: "Faculty is very knowledgeable, helpful, and explains concepts thoroughly."
  },
  {
    keywords: ["infrastructure", "classroom", "lab"],
    answer: "Very Good",
    rating: 4,
    text: "Classroom and laboratory facilities are well equipped and properly maintained."
  }
];
```
After modifying `config.js`, go to `chrome://extensions/` and click the **Reload** (🔄) button on the extension card.

---

## File Structure

```text
feedback cuims/
├── manifest.json              # Chrome Extension Manifest V3
├── config.js                  # Default configuration & keyword rules
├── content.js                 # Content script orchestrating detection & execution
├── background.js              # Service worker handling extension lifecycle & badge
├── utils/
│   ├── detector.js            # Semantic feedback detector (avoiding brittle selectors)
│   ├── formParser.js          # Table matrix, form-group & loose element parser
│   ├── answerEngine.js        # Keyword rule matcher & sentiment scale resolver
│   ├── formFiller.js          # Synthetic event dispatcher (React/jQuery/ASP.NET compatible)
│   └── submitVerifier.js      # Completeness validator, duplicate guard & submit verifier
├── popup/
│   ├── popup.html             # Popup settings interface
│   ├── popup.css              # Dark theme styling
│   └── popup.js               # UI events & storage sync
├── test/
│   ├── mock_cuims_feedback.html # Realistic CUIMS mock page for testing
│   └── mock_test.js           # Automated unit test suite
├── icons/                     # Extension icons (16x16, 48x48, 128x128)
└── README.md                  # Documentation & user guide
```
