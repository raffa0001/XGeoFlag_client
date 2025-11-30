// content.js

// ============================================================
// 1. CONFIGURATION
// ============================================================

let QUERY_ID = "XRqGa7EeokUU5kppkh13EA";
let BEARER_TOKEN = "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

const MAX_X_QUOTA = 2;
const RESET_TIME_MS = 15 * 60 * 1000;
const AUTO_MODE_DELAY = 1000;
const HOVER_TRIGGER_DELAY = 600;

let currentMode = 'hover';
let hoverTimer = null;
const queue = [];
let isProcessingQueue = false;
let visibilityObserver = null;
let activeBounties = [];

let hiveApiKey = null;
let contributeData = true;
let countryFilters = [];

// ============================================================
// 2. INITIALIZATION
// ============================================================

async function init() {
    try {
        await userDB.open();
        await userDB.pruneOlderThan(30);
    } catch(e) { console.error("DB Init Error", e); }

    chrome.storage.local.get(['mode', 'hiveApiKey', 'contributeData', 'active_bounties', 'country_filters', 'x_remote_config'], (result) => {
        currentMode = result.mode || 'hover';
        hiveApiKey = result.hiveApiKey || null;
        contributeData = result.contributeData !== undefined ? result.contributeData : true;
        activeBounties = result.active_bounties || [];
        countryFilters = result.country_filters || [];

        if (result.x_remote_config) {
            QUERY_ID = result.x_remote_config.queryId;
            BEARER_TOKEN = result.x_remote_config.bearerToken;
        }
        applyModeSettings();
        scanPage();
    });

    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === "updateMode") {
            currentMode = request.mode;
            resetScanner();
        }
        if (request.action === "clearCache") {
            resetScanner();
        }
        if (request.action === "updateConfig") {
            chrome.storage.local.get(['hiveApiKey', 'contributeData', 'active_bounties'], (res) => {
                hiveApiKey = res.hiveApiKey;
                contributeData = res.contributeData;
                activeBounties = res.active_bounties || [];
            });
        }
        if (request.action === "updateFilters") {
            countryFilters = request.filters || [];
            resetScanner();
        }
    });

    const domObserver = new MutationObserver(() => scanPage());
    domObserver.observe(document.body, { childList: true, subtree: true });
}

// ============================================================
// 3. DOM SCANNER & UI
// ============================================================

function resetScanner() {
    document.querySelectorAll('.x-geo-btn, .x-geo-flag, .x-geo-dot').forEach(el => el.remove());
    document.querySelectorAll('article').forEach(article => {
        delete article.dataset.flagScanned;
        delete article.dataset.flagStatus;
        delete article.dataset.flagScreenname;
    });
    applyModeSettings();
    scanPage();
}

function applyModeSettings() {
    if (visibilityObserver) { visibilityObserver.disconnect(); visibilityObserver = null; }
    if (currentMode === 'auto') {
        visibilityObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const screenName = el.dataset.flagScreenname;
                    if (screenName && el.dataset.flagStatus === "pending") {
                        el.dataset.flagStatus = "queued";
                        addToQueue(screenName, el);
                        visibilityObserver.unobserve(el);
                    }
                }
            });
        }, { rootMargin: "100px" });
    }
}

function scanPage() {
    const articles = document.querySelectorAll('article');
    articles.forEach(article => {
        if (article.dataset.flagScanned === "true") return;

        const userInfo = article.querySelector('[data-testid="User-Name"]');
        if (!userInfo) return;
        const timeElement = article.querySelector('time');
        if (!timeElement) return;
        const timeLink = timeElement.closest('a');
        if (!timeLink) return;
        const injectionTarget = timeLink.parentElement;

        const links = userInfo.querySelectorAll('a[href^="/"]');
        let screenName = null;

        for (const link of links) {
            const text = link.textContent || "";
            const href = link.getAttribute('href');
            if (text.includes('@')) { screenName = text.replace('@', '').trim(); break; }
            const parts = href.split('/');
            if (parts.length === 2 && !parts[1].includes('?') && parts[1].length > 0) { screenName = parts[1]; }
        }

        if (!screenName) return;

        article.dataset.flagScanned = "true";
        article.dataset.flagScreenname = screenName;
        if (!article.dataset.flagStatus) article.dataset.flagStatus = "pending";

        userDB.getUser(screenName).then(cached => {
            if (cached) {
                updateAllInstances(screenName, cached);
                userDB.saveUser(screenName, cached);
            } else {
                setupInteraction(article, injectionTarget, screenName);
            }
        });
    });
}

function updateAllInstances(screenName, countryData) {
    if (!countryData || countryData.code === "UNK") return;

    const targets = document.querySelectorAll(`article[data-flag-screenname="${screenName}"]`);

    // If the country is in the filter list, remove the entire article.
    if (countryFilters.length > 0 && countryFilters.includes(countryData.code)) {
        targets.forEach(article => article.remove());
        return; // Done.
    }

    // Otherwise, proceed to inject the flag as normal.
    targets.forEach(article => {
        if (article.dataset.flagStatus === "done") return;
        const container = findInjectionTarget(article);
        if (container) {
            injectFlag(container, countryData);
            article.dataset.flagStatus = "done";
            const btn = container.querySelector('.x-geo-btn');
            if (btn) btn.remove();
        }
    });
}

function setupInteraction(article, container, screenName) {
    if (currentMode === 'auto') {
        if (visibilityObserver) visibilityObserver.observe(article);
        return;
    }

    let btn = container.querySelector('.x-geo-btn');
    if (!btn) { btn = createButton(); injectButton(container, btn); }

    const handleAction = () => {
        if (article.dataset.flagStatus === "done") return;
        if (btn) { btn.textContent = "⏳"; btn.style.opacity = "1"; }
        processSingleRequest(screenName);
    };

    if (currentMode === 'hover') {
        article.onmouseenter = () => {
            if (article.dataset.flagStatus === "done") return;
            if (btn) btn.style.opacity = "1";
            hoverTimer = setTimeout(handleAction, HOVER_TRIGGER_DELAY);
        };
        article.onmouseleave = () => {
            if (hoverTimer) clearTimeout(hoverTimer);
            if (article.dataset.flagStatus !== "done" && btn) btn.style.opacity = "0";
        };
    }

    if (btn) {
        btn.onclick = (e) => {
            e.preventDefault(); e.stopPropagation();
            if (hoverTimer) clearTimeout(hoverTimer);
            handleAction();
        };
    }
}

// ============================================================
// 4. FETCH LOGIC (SMART)
// ============================================================

async function fetchUserSmart(screenName) {
    // Uses hashUsername from crypto.js (loaded in manifest)
    const fullHash = await hashUsername(screenName);
    const userHash = fullHash.substring(0, 16);

    const hasQuota = await checkAndConsumeQuota();
    const isBounty = activeBounties.includes(screenName);

    // --- PHASE A: X API (FREE / BOUNTY) ---
    if (hasQuota || isBounty) {
        if(isBounty) console.log(`🎯 HUNTING: ${screenName}`);

        const xResult = await fetchFromXAPI(screenName);

        if (xResult) {
            const { data: xData, restId } = xResult;

            if (xData && xData.code !== "UNK" && restId) {
                if (contributeData || isBounty) {
                    uploadToBridge(userHash, xData.code, restId, screenName);
                }
            }

            userDB.saveUser(screenName, xData);
            return { data: xData };
        }
    }

    // --- PHASE B: BRIDGE (PAID) ---
    if (hiveApiKey && hiveApiKey.startsWith('sk_')) {
        try {
            const bridgeData = await proxyGetRequest(`/v1/flag/${userHash}`);

            if (bridgeData && bridgeData.found) {
                if (bridgeData.newBalance !== undefined) {
                    chrome.storage.local.set({ userBalance: bridgeData.newBalance });
                }

                const country = getFlagData(bridgeData.payload);
                userDB.saveUser(screenName, country);
                return { data: country };
            }
        } catch (e) {}
    }

    return { error: "Limit Reached" };
}

// ============================================================
// 5. HELPERS
// ============================================================

function findInjectionTarget(article) {
    const timeElement = article.querySelector('time');
    return timeElement?.closest('a')?.parentElement;
}

function injectFlag(container, countryData) {
    if (!container) return;
    const existing = container.querySelector('.x-geo-flag');
    if (existing) return;
    if (!countryData || countryData.code === "UNK") return;

    const dot = document.createElement("span");
    dot.textContent = "·";
    dot.className = "x-geo-dot";
    dot.style.cssText = "margin: 0 4px; color: rgb(113, 118, 123);";

    const span = document.createElement("span");
    span.className = "x-geo-flag";
    span.textContent = countryData.flag;
    span.title = `Based in: ${countryData.name}`;
    span.style.cssText = `font-size: 15px; cursor: default;`;

    container.appendChild(dot);
    container.appendChild(span);
}

function injectButton(container, btn) {
    container.style.display = "flex";
    container.style.flexDirection = "row";
    container.style.alignItems = "center";
    container.appendChild(btn);
}

function createButton() {
    const btn = document.createElement('div');
    btn.className = "x-geo-btn";
    btn.textContent = "📍";
    btn.style.cssText = `display: inline-flex; align-items: center; justify-content: center; margin-left: 4px; font-size: 14px; cursor: pointer; opacity: 0; transition: opacity 0.3s ease-in-out; color: rgb(113, 118, 123); padding: 2px;`;
    return btn;
}

async function processSingleRequest(screenName) {
    const result = await fetchUserSmart(screenName);
    if (result.data) {
        updateAllInstances(screenName, result.data);
    }
}

async function fetchFromXAPI(screenName) {
    try {
        const getCookie = (n) => { const v = `; ${document.cookie}`; const p = v.split(`; ${n}=`); if (p.length === 2) return p.pop().split(';').shift(); };
        const csrfToken = getCookie('ct0');
        if (!csrfToken) return null;

        const url = `https://x.com/i/api/graphql/${QUERY_ID}/AboutAccountQuery?variables=${encodeURIComponent(JSON.stringify({ screenName }))}`;
        const response = await fetch(url, { headers: { 'authorization': BEARER_TOKEN, 'x-csrf-token': csrfToken, 'content-type': 'application/json' } });

        if (response.status === 429) {
            chrome.storage.local.set({ requestsUsed: MAX_X_QUOTA, firstRequestTime: Date.now() });
            return null;
        }

        const json = await response.json();
        const res = json.data?.user_result_by_screen_name?.result;
        if (!res) return null;

        const loc = res.about_profile?.account_based_in;
        const restId = res.rest_id;
        const data = loc ? getFlagData(loc) : { code: "UNK", flag: "❓", name: "Unknown" };

        return { data, restId };
    } catch (e) { return null; }
}

function uploadToBridge(userHash, code, restId, screenName) {
    chrome.runtime.sendMessage({
        action: "PROXY_REQ",
        data: { type: 'POST', endpoint: '/v1/flag', body: { userHash, encryptedPayload: code, restId, screenName } }
    });
}

function proxyGetRequest(endpoint) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            action: "PROXY_REQ",
            data: { type: 'GET', endpoint, apiKey: hiveApiKey }
        }, (r) => resolve(r && r.success ? r.data : null));
    });
}


async function checkAndConsumeQuota() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['requestsUsed', 'firstRequestTime'], (d) => {
            const now = Date.now();
            let used = d.requestsUsed || 0;

            // 1. Check for Reset FIRST
            if (now - (d.firstRequestTime || 0) > RESET_TIME_MS) {
                used = 0;
                // Important: We don't await this set, but we use local var 'used' for logic below
                chrome.storage.local.set({ requestsUsed: 0, firstRequestTime: now });
            }

            // 2. Check Limit
            if (used >= MAX_X_QUOTA) {
                resolve(false);
            } else {
                // 3. Increment & Save
                // We increment the local variable first to ensure logic consistency
                const newUsed = used + 1;

                // If this was the first request, set the timer
                const newTime = (used === 0) ? now : (d.firstRequestTime || now);

                chrome.storage.local.set({
                    requestsUsed: newUsed,
                    firstRequestTime: newTime
                }, () => {
                    if (chrome.runtime.lastError) {
                        // Context was invalidated, do nothing.
                        return;
                    }
                    // Only resolve true AFTER storage is confirmed saved
                    resolve(true);
                });
            }
        });
    });
}

init();
