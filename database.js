// database.js

class UserDatabase {
    constructor() {
        // We use a prefix to keep storage clean
        this.PREFIX = "u_";
    }

    // Open is now a no-op since chrome.storage is always open,
    // but kept for compatibility with existing code structure.
    async open() {
        return Promise.resolve();
    }

    async getUser(screenName) {
        return new Promise((resolve) => {
            const key = this.PREFIX + screenName.toLowerCase();
            chrome.storage.local.get([key], (result) => {
                if (result[key]) {
                    resolve(result[key].country);
                } else {
                    resolve(null);
                }
            });
        });
    }

    async saveUser(screenName, countryData) {
        return new Promise((resolve) => {
            const key = this.PREFIX + screenName.toLowerCase();
            const record = {
                country: countryData,
                lastSeen: Date.now()
            };
            const data = {};
            data[key] = record;
            chrome.storage.local.set(data, () => resolve());
        });
    }

    // --- CACHE MANAGEMENT ---

    async getCount() {
        return new Promise((resolve) => {
            chrome.storage.local.get(null, (items) => {
                const count = Object.keys(items).filter(k => k.startsWith(this.PREFIX)).length;
                resolve(count);
            });
        });
    }

    async pruneOlderThan(days) {
        return new Promise((resolve) => {
            const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
            chrome.storage.local.get(null, (items) => {
                const keysToRemove = [];
                Object.keys(items).forEach(k => {
                    if (k.startsWith(this.PREFIX)) {
                        if (items[k].lastSeen < cutoff) {
                            keysToRemove.push(k);
                        }
                    }
                });

                if (keysToRemove.length > 0) {
                    chrome.storage.local.remove(keysToRemove, () => resolve(keysToRemove.length));
                } else {
                    resolve(0);
                }
            });
        });
    }

    async clearAll() {
        return new Promise((resolve) => {
            chrome.storage.local.get(null, (items) => {
                const keys = Object.keys(items).filter(k => k.startsWith(this.PREFIX));
                chrome.storage.local.remove(keys, () => resolve());
            });
        });
    }
}

// Export instance
const userDB = new UserDatabase();
