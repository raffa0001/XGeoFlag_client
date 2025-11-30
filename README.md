# 🌍 X GeoFlag Client

**Crowdsourced Location Intelligence for 𝕏 (formerly Twitter).**

X GeoFlag is a browser extension that reveals the *real* country of origin for X profiles. It uses a decentralized "Hive Mind" approach where users verify locations, resolve conflicts, and earn credits powered by the **R-Squared Network**.


## ✨ Features

*   **📍 Flag Injection:** Automatically adds country flags next to profile names and timestamps.
*   **🧠 Hive Mind Consensus:** Data is verified by the community.
*   **⚔️ Conflict Resolution:** Participate in "Bounties" to verify conflicting data and earn credits.
*   **⚡ Smart Caching:** Only queries the network when necessary; stores data locally for 30 days.

## 🚀 Installation (Developer Mode)

Since this extension is in active development, you can install it directly from the source code.

1.  **Download the Code:**
    *   Click the green **Code** button above and select **Download ZIP**.
    *   Extract the ZIP file to a folder on your computer.
    *   *(Or clone via git: `git clone https://github.com/YOUR_USERNAME/x-geoflag-client.git`)*

2.  **Open Chrome Extensions:**
    *   In your browser address bar, type: `chrome://extensions`
    *   Press Enter.

3.  **Enable Developer Mode:**
    *   Look for the toggle switch named **Developer mode** in the top-right corner.
    *   Turn it **ON**.

4.  **Load the Extension:**
    *   Click the **Load unpacked** button (top-left).
    *   Select the folder where you extracted the files (ensure `manifest.json` is inside that folder).

5.  **Done!**
    *   Pin the extension to your toolbar.
    *   Visit X.com to see it in action.

## 🎮 Usage

### The "Blue Badge" System
*   **Guest Mode:** You have a limited free quota of lookups (tied to X api, resets every 15 minutes).
*   **User Mode:** Click the extension icon and log in (or enter an API Key) to contribute to the network and get higher rate limits.

### Bounties (Conflict Zone)
The extension periodically checks for stalled Polls.
1.  Open the extension popup.
2.  Click the **Bounties** tab.
3.  Click a user to visit their profile.
4.  verify their location submitting a vote.

## 🛠️ Configuration

The extension works out of the box. However, power users can configure settings via the Popup:
*   **Scan Mode:**
    *   `Hover`: Reveal flag only when hovering over a tweet (Saves API calls).
    *   `Auto`: Automatically scans profiles as you scroll.
*   **Filters:** Filter out specific countries you don't want to see.

## 📄 License

This project is licensed under the MIT License.

---
*Disclaimer: This project is an independent open-source initiative and is not affiliated with, endorsed by, or sponsored by X Corp.*
