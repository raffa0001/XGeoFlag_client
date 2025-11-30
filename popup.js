document.addEventListener('DOMContentLoaded', async () => {

    // --- CONFIGURATION ---
    const BRIDGE_URL = "https://api.xgeoflag.eu"; // Ensure this points to your live API
    const WEBSITE_URL = "https://xgeoflag.eu";
    let timerInterval = null;
    let bountyTimerInterval = null;
    let countryFilters = [];

    // --- 1. TABS LOGIC ---
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('#tab-status, #tab-bounties, #tab-filters, #tab-account').forEach(c => c.classList.add('hidden'));

            tab.classList.add('active');
            const target = document.getElementById(tab.dataset.target);
            target.classList.remove('hidden');

            if (tab.dataset.target === 'tab-bounties') fetchBounties();
            if (tab.dataset.target === 'tab-filters') renderSelectedFilters();
        });
    });

    // --- 2. DATA LOADING ---
    try { await userDB.open(); updateCacheStats(); } catch(e){}

    chrome.storage.local.get(['mode', 'requestsUsed', 'firstRequestTime', 'hiveApiKey', 'userBalance', 'pending_credits', 'theme', 'country_filters'], (data) => {
        if (data.theme === 'light') applyTheme(true);

        countryFilters = data.country_filters || [];

        const modeSel = document.getElementById('modeSelect');
        if(modeSel) modeSel.value = data.mode || 'hover';

        updateQuotaUI(data.requestsUsed, data.firstRequestTime);
        updatePendingUI(data.pending_credits);

        if (data.hiveApiKey && data.hiveApiKey.startsWith('sk_')) {
            showProfile(data.hiveApiKey, data.userBalance || 0);
        } else {
            updatePendingUI(data.pending_credits);
        }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            if (changes.requestsUsed || changes.firstRequestTime) {
                chrome.storage.local.get(['requestsUsed', 'firstRequestTime'], (d) => updateQuotaUI(d.requestsUsed, d.firstRequestTime));
            }
            if (changes.userBalance) {
                const balEl = document.getElementById('userBal');
                if(balEl) balEl.textContent = changes.userBalance.newValue || 0;
            }
            if (changes.pending_credits) updatePendingUI(changes.pending_credits.newValue);
            if (changes.country_filters) {
                countryFilters = changes.country_filters.newValue || [];
                renderSelectedFilters();
                notifyContent({ action: "updateFilters", filters: countryFilters });
            }
            if (Object.keys(changes).some(k => k.startsWith('u_'))) updateCacheStats();
        }
    });

    // --- 3. EVENT LISTENERS (UI) ---

    const themeBtn = document.getElementById('themeToggle');
    function applyTheme(isLight) {
        document.body.classList.toggle('light-mode', isLight);
        if(themeBtn) themeBtn.textContent = isLight ? '🌙' : '☀️';
    }

    if(themeBtn) {
        themeBtn.addEventListener('click', () => {
            const isLight = document.body.classList.toggle('light-mode');
            applyTheme(isLight);
            chrome.storage.local.set({ theme: isLight ? 'light' : 'dark' });
        });
    }

    const tabLogin = document.getElementById('tabMethodLogin');
    const tabKey = document.getElementById('tabMethodKey');
    const formLogin = document.getElementById('formLogin');
    const formKey = document.getElementById('formKey');
    const msg = document.getElementById('authMsg');

    if(tabLogin && tabKey) {
        tabLogin.addEventListener('click', () => {
            tabLogin.classList.add('active'); tabKey.classList.remove('active');
            formLogin.classList.remove('hidden'); formKey.classList.add('hidden');
            if(msg) msg.textContent = "";
        });

        tabKey.addEventListener('click', () => {
            tabKey.classList.add('active'); tabLogin.classList.remove('active');
            formLogin.classList.add('hidden'); formKey.classList.remove('hidden');
            if(msg) msg.textContent = "";
        });
    }

    const btnOpenReg = document.getElementById('btnOpenReg');
    if(btnOpenReg) btnOpenReg.addEventListener('click', () => chrome.tabs.create({ url: WEBSITE_URL }));

    const btnLogin = document.getElementById('btnLogin');
    if(btnLogin) btnLogin.addEventListener('click', () => performAuth());

    const btnSaveKey = document.getElementById('btnSaveKey');
    if(btnSaveKey) btnSaveKey.addEventListener('click', () => validateKey());

    const btnLogout = document.getElementById('btnLogout');
    if(btnLogout) btnLogout.addEventListener('click', () => {
        chrome.storage.local.remove(['hiveApiKey', 'userBalance']);
        location.reload();
    });

    const apiKeyDisplayInput = document.getElementById('apiKeyDisplayInput');
    const toggleKeyBtn = document.getElementById('toggleKeyBtn');
    if(toggleKeyBtn) toggleKeyBtn.addEventListener('click', () => {
        apiKeyDisplayInput.type = apiKeyDisplayInput.type === 'password' ? 'text' : 'password';
    });

    const copyKeyBtn = document.getElementById('copyKeyBtn');
    if(copyKeyBtn) copyKeyBtn.addEventListener('click', () => {
        if(apiKeyDisplayInput.value) navigator.clipboard.writeText(apiKeyDisplayInput.value);
    });

    const modeSelect = document.getElementById('modeSelect');
    if(modeSelect) modeSelect.addEventListener('change', (e) => {
        const newMode = e.target.value;
        chrome.storage.local.set({ mode: newMode });
        notifyContent({ action: "updateMode", mode: newMode });
    });

    const btnPrune = document.getElementById('btnPrune');
    if(btnPrune) btnPrune.addEventListener('click', async () => {
        await userDB.pruneOlderThan(30); updateCacheStats();
    });

    const btnClearAll = document.getElementById('btnClearAll');
    if(btnClearAll) btnClearAll.addEventListener('click', async () => {
        if(confirm("Delete ALL cached locations?")) {
            await userDB.clearAll();
            updateCacheStats();
            notifyContent({ action: "clearCache" });
        }
    });

    const filterSearchInput = document.getElementById('filterSearchInput');
    if(filterSearchInput) {
        filterSearchInput.addEventListener('input', () => {
            const searchTerm = filterSearchInput.value.toLowerCase();
            if (searchTerm.length === 0) {
                renderFilterResults([]);
                return;
            }
            // RAW_COUNTRY_DATA is from countries-data.js
            const results = RAW_COUNTRY_DATA.filter(c => c.country.toLowerCase().includes(searchTerm)).slice(0, 50);
            renderFilterResults(results);
        });
    }

    // --- 4. FILTERS LOGIC ---
    function renderSelectedFilters() {
        const container = document.getElementById('selectedFilters');
        if (!container) return;

        if (countryFilters.length === 0) {
            container.innerHTML = '<div class="small-text">No active filters.</div>';
            return;
        }

        container.innerHTML = '';
        countryFilters.forEach(isoCode => {
            const countryData = RAW_COUNTRY_DATA.find(c => c.isoCode === isoCode);
            if (!countryData) return;

            const filterTag = document.createElement('div');
            filterTag.className = 'filter-item';
            filterTag.textContent = `${countryData.emojiFlag} ${countryData.country}`;
            filterTag.title = 'Click to remove';
            filterTag.addEventListener('click', () => removeFilter(isoCode));
            container.appendChild(filterTag);
        });
    }

    function addFilter(isoCode) {
        if (!countryFilters.includes(isoCode)) {
            countryFilters.push(isoCode);
            chrome.storage.local.set({ country_filters: countryFilters });
        }
        filterSearchInput.value = '';
        renderFilterResults([]);
    }

    function removeFilter(isoCode) {
        countryFilters = countryFilters.filter(c => c !== isoCode);
        chrome.storage.local.set({ country_filters: countryFilters });
    }

    function renderFilterResults(results) {
        const container = document.getElementById('filterSearchResults');
        if (!container) return;
        container.innerHTML = '';

        results.forEach(countryData => {
            const resultEl = document.createElement('div');
            resultEl.className = 'filter-search-result';
            resultEl.innerHTML = `<span class="flag">${countryData.emojiFlag}</span> <span>${countryData.country}</span>`;
            resultEl.addEventListener('click', () => addFilter(countryData.isoCode));
            container.appendChild(resultEl);
        });
    }

    // --- 5. BOUNTIES & CACHING LOGIC ---
    
        // Helper: Get list of bounties visited TODAY
        async function getVisitedBounties() {
            const today = new Date().toDateString(); // e.g. "Sat Nov 29 2025"
            const d = await chrome.storage.local.get(['daily_visited']);
            if (d.daily_visited && d.daily_visited.date === today) {
                return d.daily_visited.hashes || [];
            }
            return [];
        }

        // Helper: Mark a hash as visited today
        async function markBountyVisited(hash) {
            const today = new Date().toDateString();
            const d = await chrome.storage.local.get(['daily_visited']);
            let hashes = [];
            if (d.daily_visited && d.daily_visited.date === today) {
                hashes = d.daily_visited.hashes;
            }
            if (!hashes.includes(hash)) hashes.push(hash);
            await chrome.storage.local.set({ daily_visited: { date: today, hashes } });
        }

        async function fetchBounties() {
            const list = document.getElementById('bounties-list');
            if(!list) return;

            // 1. CHECK CACHE
            const cache = await chrome.storage.local.get(['bounty_cache']);
            const now = Date.now();
            let data = [];

            // If cache exists and the earliest nextFetch time hasn't passed
            if (cache.bounty_cache && cache.bounty_cache.nextFetch > now) {
                console.log("Using Cached Bounties");
                data = cache.bounty_cache.items;
            } else {
                // Fetch New
                try {
                    list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--subtext);">Scanning network...</div>';
                    const res = await fetch(`${BRIDGE_URL}/v1/bounties/active`, {
                        headers: { "X-GeoFlag-Client": "extension" }
                    });

                    if (!res.ok) throw new Error("Network Error");
                    data = await res.json();

                    // Determine next fetch time.
                    // If bounties exist, fetch again when the earliest one ends (plus buffer).
                    // If no bounties, wait 5 minutes.
                    let nextTime = now + (5 * 60 * 1000);
                    if (data.length > 0) {
                        const minEnd = Math.min(...data.map(b => b.endTime));
                        // Don't fetch until the first one expires
                        nextTime = Math.max(now + 10000, minEnd);
                    }

                    await chrome.storage.local.set({
                        bounty_cache: { items: data, nextFetch: nextTime }
                    });
                } catch(e) {
                    list.innerHTML = `<div class="error-msg">Connection Failed.</div>`;
                    return;
                }
            }

            renderBounties(data);
        }

        async function renderBounties(data) {
            const list = document.getElementById('bounties-list');
            if (bountyTimerInterval) clearInterval(bountyTimerInterval);

            const visited = await getVisitedBounties();
            // Filter out bounties we've already clicked/visited today
            const filtered = data.filter(b => !visited.includes(b.hash));

            list.innerHTML = "";
            if(filtered.length === 0) {
                list.innerHTML = '<div style="text-align:center; padding:20px; font-size:12px; color:var(--subtext);">No active conflicts (or all visited).</div>';
                return;
            }

            filtered.forEach(b => {
                const div = document.createElement('div');
                div.className = 'bounty-item';
                div.innerHTML = `
                <div style="flex:1;">
                <a href="https://x.com/${b.name}" target="_blank" class="b-name">@${b.name}</a>
                <div class="timer-text" data-end="${b.endTime}" style="font-size:10px; color:var(--accent); margin-top:2px;">--:--</div>
                </div>
                <div style="text-align:right;">
                <span class="b-reward" style="${b.bounty > 20 ? 'background:rgba(255,0,0,0.15); color:#ff4444;' : ''}">+${b.bounty || 20} CR</span>
                </div>
                `;

                // Mark as visited when clicked
                const link = div.querySelector('a');
                link.addEventListener('click', () => {
                    markBountyVisited(b.hash);
                    div.style.opacity = '0.5';
                });

                list.appendChild(div);
            });

            // Start Countdown Loop
            bountyTimerInterval = setInterval(() => {
                const now = Date.now();
                document.querySelectorAll('.timer-text').forEach(t => {
                    const end = parseInt(t.dataset.end);
                    if (isNaN(end)) {
                        t.textContent = "Processing...";
                        return;
                    }
                    const diff = end - now;
                    if (diff <= 0) {
                        t.textContent = "Processing...";
                        t.style.color = "var(--subtext)";
                    } else {
                        const hours = Math.floor(diff / (1000 * 60 * 60));
                        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                        t.textContent = `Ends in ${hours}h ${minutes}m ${seconds}s`;
                        // Red color if less than 1 min
                        if (diff < 60000) t.style.color = "var(--danger)";
                    }
                });
            }, 1000);
        }

        // --- 6. QUOTA UI ---
        function updateQuotaUI(used, startTime) {
            const MAX_QUOTA = 50; // Make sure this matches your content.js config
            const val = Math.max(0, MAX_QUOTA - (used || 0));
            const display = document.getElementById('quotaDisplay');
            if(display) display.textContent = val;

            const timerEl = document.getElementById('quotaTimer');
            if (!timerEl) return;

            if (timerInterval) clearInterval(timerInterval);

            if (used > 0 && startTime) {
                const resetTime = startTime + (15 * 60 * 1000);
                timerInterval = setInterval(() => {
                    const now = Date.now();
                    const diff = resetTime - now;

                    if (diff <= 0) {
                        clearInterval(timerInterval);
                        timerEl.textContent = "Resets every 15 minutes.";
                        timerEl.style.color = "var(--subtext)";
                    } else {
                        const m = Math.floor(diff / 60000);
                        const s = Math.floor((diff % 60000) / 1000);
                        timerEl.textContent = `Resets in ${m}:${s < 10 ? '0'+s : s}`;
                        timerEl.style.color = val === 0 ? "#f4212e" : "var(--subtext)";
                    }
                }, 1000);
            } else {
                timerEl.textContent = "Resets every 15 minutes.";
                timerEl.style.color = "var(--subtext)";
            }
        }

        // --- 7. AUTH ACTIONS ---

        function performAuth() {
            const email = document.getElementById('authEmail').value.trim();
            const pass = document.getElementById('authPass').value.trim();
            if(!email || !pass) return msg.textContent = "Please fill all fields";
            msg.textContent = "Connecting...";

            chrome.runtime.sendMessage({
                action: "PROXY_REQ",
                data: { type: 'POST', endpoint: '/v1/user/login', body: { email, password: pass } }
            }, (res) => {
                if(res && res.success && res.data.apiKey) {
                    chrome.storage.local.set({ hiveApiKey: res.data.apiKey, userBalance: res.data.balance });
                    showProfile(res.data.apiKey, res.data.balance);
                    msg.textContent = "";
                } else {
                    msg.textContent = res.data?.error || "Error: No API Key received.";
                }
            });
        }

        function validateKey() {
            const key = document.getElementById('manualKeyInput').value.trim();
            if(!key.startsWith('sk_')) return msg.textContent = "Key must start with 'sk_'";
            msg.textContent = "Verifying...";
            chrome.runtime.sendMessage({
                action: "PROXY_REQ",
                data: { type: 'GET', endpoint: '/v1/heartbeat', apiKey: key }
            }, (res) => {
                if(res && res.success) {
                    chrome.storage.local.set({ hiveApiKey: key, userBalance: res.data.credits || 0 });
                    showProfile(key, res.data.credits || 0);
                    msg.textContent = "";
                } else {
                    msg.textContent = "Invalid Key";
                }
            });
        }

        function showProfile(key, bal) {
            document.getElementById('login-view').classList.add('hidden');
            document.getElementById('profile-view').classList.remove('hidden');
            if(apiKeyDisplayInput) apiKeyDisplayInput.value = key;
            const balEl = document.getElementById('userBal');
            if(balEl) balEl.textContent = bal;
            notifyContent({ action: "updateConfig" });
        }

        function updatePendingUI(val) {
            const pending = val || 0;
            const banner = document.getElementById('pendingBanner');
            const loginView = document.getElementById('login-view');

            if (banner && pending > 0 && loginView && !loginView.classList.contains('hidden')) {
                banner.classList.remove('hidden');
                const pVal = document.getElementById('pendingVal');
                if(pVal) pVal.textContent = pending;
            } else if (banner) {
                banner.classList.add('hidden');
            }
        }

        async function updateCacheStats() {
            try {
                const el = document.getElementById('cacheCount');
                if(el) el.textContent = await userDB.getCount();
            } catch(e){}
        }

        function notifyContent(msg) {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                if (tabs[0]?.id) chrome.tabs.sendMessage(tabs[0].id, msg, () => chrome.runtime.lastError);
            });
        }
});
