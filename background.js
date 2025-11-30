// IMPORT DATABASE UTILITY (Required for Cache Checking)
try {
    importScripts('database.js');
} catch (e) {
    console.error("Failed to load database.js", e);
}

const API_BASE = "https://api.xgeoflag.eu";
const RESET_TIME_MS = 15 * 60 * 1000;

// ============================================================
// 1. LIFECYCLE & HANDSHAKE
// ============================================================

chrome.runtime.onInstalled.addListener(async () => {
    await registerClient();
    await checkHeartbeat();

    // Heartbeat: Fetches Bounties (Tasks)
    chrome.alarms.create("heartbeat", { periodInMinutes: 10 });

    // Quota: Checks if 15m have passed to reset Blue Badge
    chrome.alarms.create("quotaCheck", { periodInMinutes: 1 });

    updateBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "heartbeat") checkHeartbeat();
    if (alarm.name === "quotaCheck") checkQuotaReset();
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        if (changes.requestsUsed || changes.userBalance || changes.hiveApiKey) {
            updateBadge();
        }
    }
});

// ============================================================
// 2. BADGE & QUOTA
// ============================================================

async function checkQuotaReset() {
    const data = await chrome.storage.local.get(['firstRequestTime', 'requestsUsed']);
    const now = Date.now();
    if ((data.requestsUsed > 0) && (now - (data.firstRequestTime || 0) > RESET_TIME_MS)) {
        await chrome.storage.local.set({ requestsUsed: 0, firstRequestTime: now });
    }
}

async function updateBadge() {
    const data = await chrome.storage.local.get(['requestsUsed', 'userBalance', 'hiveApiKey']);
    const MAX_X_QUOTA = 50;
    const used = data.requestsUsed || 0;
    const remainingX = Math.max(0, MAX_X_QUOTA - used);

    if (remainingX > 0) {
        chrome.action.setBadgeText({ text: formatBadge(remainingX) });
        chrome.action.setBadgeBackgroundColor({ color: "#1d9bf0" });
    } else {
        if (data.hiveApiKey) {
            const balance = data.userBalance || 0;
            chrome.action.setBadgeText({ text: formatBadge(balance) });
            if (balance < 10) chrome.action.setBadgeBackgroundColor({ color: "#f4212e" });
            else chrome.action.setBadgeBackgroundColor({ color: "#00ba7c" });
        } else {
            chrome.action.setBadgeText({ text: "!" });
            chrome.action.setBadgeBackgroundColor({ color: "#777" });
        }
    }
}

function formatBadge(num) {
    if (num === undefined || num === null) return "";
    if (num < 1000) return num.toString();
    if (num < 1000000) return (num / 1000).toFixed(num < 10000 ? 1 : 0).replace('.0', '') + 'k';
    return "999b";
}

// ============================================================
// 3. LOGIC (Register & Heartbeat)
// ============================================================

async function registerClient() {
    const storage = await chrome.storage.local.get(['install_token']);
    if (!storage.install_token) {
        try {
            const req = await fetch(`${API_BASE}/v1/register`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-GeoFlag-Client": "extension" // Bypass Cloudflare
                }
            });
            const res = await req.json();
            if (res.token) await chrome.storage.local.set({ install_token: res.token });
        } catch (e) { console.error("Registration Failed", e); }
    }
}

async function checkHeartbeat() {
    const storage = await chrome.storage.local.get(['install_token']);
    if(!storage.install_token) return;

    try {
        const res = await fetch(`${API_BASE}/v1/heartbeat`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-install-token': storage.install_token,
                'X-GeoFlag-Client': 'extension' // Bypass Cloudflare
            }
        });

        if (res.ok) {
            const json = await res.json();
            console.log("Heartbeat success. Candidates:", json.tasks.length);

            // --- NEW: FILTERING LOGIC ---
            // json.tasks is now an array of objects: [{ hash: "...", name: "..." }, ...]

            const validTasks = [];
            // We use the imported userDB instance (created by importScripts)
            // Note: userDB is async.

            for (const task of json.tasks) {
                if (validTasks.length >= 10) break; // Limit to 10 active

                // Check local cache using the name
                const isCached = await userDB.getUser(task.name);

                if (!isCached) {
                    // Only store the name or hash in active_bounties for content.js to use
                    // content.js expects an array of strings (usernames) to match against the DOM
                    validTasks.push(task.name);
                }
            }

            console.log(`Filtered Bounties: ${json.tasks.length} -> ${validTasks.length}`);

            await chrome.storage.local.set({ active_bounties: validTasks });
            if (json.credits !== undefined) await chrome.storage.local.set({ pending_credits: json.credits });

            // SAVE REMOTE CONFIG
            if (json.xConfig) {
                await chrome.storage.local.set({ x_remote_config: json.xConfig });
            }
        } else {
            console.error("Heartbeat failed with status:", res.status);
        }
    } catch(e) {
        console.error("Heartbeat failed with exception:", e);
    }
}

// ============================================================
// 4. PROXY HANDLER (STRICT MODE)
// ============================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "PROXY_REQ") {
        handleProxy(request, sendResponse);
        return true;
    }
});

async function handleProxy(req, sendResponse) {
    const { type, endpoint, body, apiKey } = req.data;

    const storage = await chrome.storage.local.get(['install_token']);
    let installToken = storage.install_token;

    if (!installToken && type === 'POST') {
        await registerClient();
        const newStore = await chrome.storage.local.get(['install_token']);
        installToken = newStore.install_token;
    }

    const headers = {
        "Content-Type": "application/json",
        "X-GeoFlag-Client": "extension" // Bypass Cloudflare
    };

    if (type === 'POST') {
        headers['x-install-token'] = installToken || "";
    } else if (type === 'GET') {
        if (!apiKey) {
            return sendResponse({ success: false, error: "Login Required" });
        }
        headers['x-api-key'] = apiKey;
    }

    try {
        const fetchOpts = { method: type, headers };
        if (body) fetchOpts.body = JSON.stringify(body);

        const res = await fetch(`${API_BASE}${endpoint}`, fetchOpts);
        const json = await res.json();

        sendResponse({ success: res.ok, status: res.status, data: json });
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}
