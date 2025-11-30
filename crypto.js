// crypto.js

const ENC = new TextEncoder();

// 1. Hash Username (SHA-256)
// We keep this to anonymize the user on the blockchain
async function hashUsername(screenName) {
    if (!screenName) return null;
    const data = ENC.encode(screenName.toLowerCase().trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
