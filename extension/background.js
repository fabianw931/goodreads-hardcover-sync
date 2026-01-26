import { SyncEngine, Utils } from './core.js';

// --- Constants & State ---
let HC_TOKEN = null;
let RSS_URL = null;
let isChecking = false;
let lastCheckTime = 0;
const CHECK_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// --- Listeners ---

// 1. Tab Update (Navigation)
// 1. Tab Update (Navigation) - DISABLED (User requested manual sync only)
// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//     if (changeInfo.status === 'complete' && tab.url && tab.url.includes('hardcover.app')) {
//         checkAndNotify(tabId);
//     }
// });

// 2. Message from Content Script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "START_SYNC") {
        // Force run (ignoring cooldown)
        runSync(sender.tab.id, false); 
    }
});

// --- Core Logic ---

// --- Auto-Discovery Logic ---

async function discoverHardcoverToken() {
    console.log("Auto-discovering Hardcover token...");
    try {
        // Since we are likely ON hardcover.app, this fetch should work if logged in
        const response = await fetch("https://hardcover.app/account/api", { credentials: 'include' });
        if (response.url.includes("login")) {
            console.warn("Hardcover Login Required");
            return null;
        }

        const html = await response.text();
        const match = html.match(/eyJ[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/);
        
        if (match) {
            const token = match[0];
            await chrome.storage.local.set({ hc_token: token });
            HC_TOKEN = token;
            console.log("Hardcover Token Discovered!");
            return token;
        }
    } catch (e) {
        console.error("Hardcover Discovery Failed:", e);
    }
    return null;
}

async function discoverGoodreadsRSS() {
    console.log("Auto-discovering Goodreads RSS...");
    try {
        const response = await fetch("https://www.goodreads.com/review/list?shelf=read", { credentials: 'include' });
        
        if (response.url.includes("user/sign_in")) {
            console.warn("Goodreads Login Required");
            return { success: false, reason: "Login Required" };
        }
        
        const html = await response.text();
        const rssUrl = Utils.findRssLink(html);
        
        if (rssUrl) {
            let finalUrl = rssUrl;
            if (finalUrl.startsWith('/')) {
                finalUrl = `https://www.goodreads.com${finalUrl}`;
            }

            await chrome.storage.local.set({ rss_url: finalUrl });
            RSS_URL = finalUrl;
            console.log("Goodreads RSS Discovered!", finalUrl);
            return { success: true, url: finalUrl };
        } else {
            console.warn("Goodreads RSS Link Not Found in HTML");
            return { success: false, reason: "RSS Link Not Found (Parse Error)" };
        }
    } catch (e) {
        console.error("Goodreads Discovery Failed:", e);
        return { success: false, reason: `Network Error: ${e.message}` };
    }
}

// --- Core Logic ---

async function checkAndNotify(tabId) {
    if (isChecking) {
        console.log("Check already in progress. Skipping.");
        return;
    }
    
    // Cooldown Check (only for auto-check)
    const timeSinceLast = Date.now() - lastCheckTime;
    if (timeSinceLast < CHECK_COOLDOWN_MS) {
        console.log(`Skipping check (Cooldown: needs ${Math.ceil((CHECK_COOLDOWN_MS - timeSinceLast)/1000)}s more).`);
        return;
    }

    try {
        isChecking = true;
        console.log("Checking for updates...");
        
        // 1. Credentials
        await loadCredentials();
        
        // 2. Auto-Discovery if missing
        let grStatus = { success: !!RSS_URL };
        
        if (!HC_TOKEN) await discoverHardcoverToken();
        if (!RSS_URL) grStatus = await discoverGoodreadsRSS();

        console.log(`Credentials Status: Token: ${!!HC_TOKEN}, RSS: ${!!RSS_URL}`);
        
        if (!HC_TOKEN || !RSS_URL) {
            console.warn("Credentials still missing after auto-discovery. Prompting user.");
            try {
                chrome.tabs.sendMessage(tabId, {
                    action: 'SHOW_SETUP_REQUIRED',
                    data: { 
                        missingHardcover: !HC_TOKEN,
                        missingGoodreads: !RSS_URL,
                        goodreadsError: grStatus.reason || "Unknown"
                    }
                });
            } catch (e) { console.error(e); }
            return; 
        } 

        // 3. Dry Run Check
        console.log("Starting Dry Run...");
        const newBooksCount = await runSync(tabId, true); // Dry Run
        console.log(`Dry Run Complete. Found ${newBooksCount} new books.`);
        
        if (newBooksCount > 0) {
            console.log("Sending SHOW_MODAL message...");
            try {
                chrome.tabs.sendMessage(tabId, {
                    action: 'SHOW_MODAL',
                    data: { newCount: newBooksCount }
                });
                console.log("Message sent.");
            } catch (e) {
                console.error("Failed to send message:", e);
            }
        } else {
            console.log("No new books found, staying silent.");
        }
        
        // Only update timestamp if we successfully ran a check
        lastCheckTime = Date.now();

    } finally {
        isChecking = false;
    }
}

async function loadCredentials() {
    const storage = await chrome.storage.local.get(['hc_token', 'rss_url']);
    if (storage.hc_token) HC_TOKEN = storage.hc_token;
    if (storage.rss_url) RSS_URL = storage.rss_url;
}

// --- Sync Engine Adapter ---

async function runSync(tabId, isDryRun) {
    try {
        if (!HC_TOKEN || !RSS_URL) {
            console.error("Missing credentials for sync.");
            return 0;
        }

        const engine = new SyncEngine({
            hcToken: HC_TOKEN,
            rssUrl: RSS_URL,
            isDryRun: isDryRun,
            limit: 10, // Reduced to 10 as requested
            onLog: (msg, type) => {
                // 1. Console Log (Always)
                if (type === 'error') console.error(msg);
                else if (type === 'warn') console.warn(msg);
                else console.log(msg);

                // 2. Tab Message (If Tab ID exists and NOT debug)
                if (tabId && type !== 'debug') {
                    chrome.tabs.sendMessage(tabId, {
                        action: 'UPDATE_LOG',
                        message: msg,
                        type: type
                    }).catch(() => { /* Ignore tab closed */ });
                }
            }
        });

        const results = await engine.run();

        if (!isDryRun && tabId) {
            chrome.tabs.sendMessage(tabId, { action: 'SYNC_COMPLETE' }).catch(() => {});
        }

        return results.newBooks;

    } catch (e) {
        console.error("Sync Critical Error:", e);
        if (tabId && !isDryRun) {
             chrome.tabs.sendMessage(tabId, { 
                 action: 'UPDATE_LOG', 
                 message: `Critical Error: ${e.message}`, 
                 type: 'error' 
             }).catch(() => {});
        }
        return 0;
    }
}
