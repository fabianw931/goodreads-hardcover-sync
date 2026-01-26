/**
 * Hardcover Sync Extension Logic
 */
import { SyncEngine, Utils } from './core.js';

// DOM Elements
const btnSync = document.getElementById('btn-sync');
const statusGoodreads = document.getElementById('status-goodreads');
const statusHardcover = document.getElementById('status-hardcover');

let HC_TOKEN = null;
let RSS_URL = null;

// --- Helpers ---

function log(msg, type='info') {
    console.log(`[${type.toUpperCase()}] ${msg}`);
    const container = document.getElementById('log-container');
    if (container) {
        const div = document.createElement('div');
        div.className = `log-${type}`;
        div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }
}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
    log("Initializing...", "debug");
    
    // 1. Try to get Credentials from Chrome Storage first
    const storage = await chrome.storage.local.get(['hc_token', 'rss_url']);
    if (storage.hc_token) HC_TOKEN = storage.hc_token;
    if (storage.rss_url) RSS_URL = storage.rss_url;

    // 2. Discover Credentials if missing
    if (!HC_TOKEN) await discoverHardcoverToken();
    else setStatus(statusHardcover, "Ready", true);

    if (!RSS_URL) await discoverGoodreadsRSS();
    else setStatus(statusGoodreads, "Ready", true);

    // 3. Enable Sync Button
    if (HC_TOKEN && RSS_URL) {
        btnSync.disabled = false;
    }
});

btnSync.addEventListener('click', async () => {
    btnSync.disabled = true;
    btnSync.textContent = "Syncing...";
    
    try {
        if (!HC_TOKEN || !RSS_URL) {
            log("Missing credentials.", "error");
            return;
        }

        const engine = new SyncEngine({
            hcToken: HC_TOKEN,
            rssUrl: RSS_URL,
            isDryRun: false,
            limit: 10, // Safety limit for manual sync
            onLog: (msg, type) => {
                // Bridge engine logs to UI logs
                log(msg, type);
            }
        });

        // Run Sync
        const results = await engine.run();

        // Summary
        if (results.newBooks > 0) {
             log(`=== Sync Complete. Added ${results.newBooks} books. ===`, "success");
        } else {
             log("Sync Complete. No new books to add.", "success");
        }
        
        btnSync.textContent = "Sync Complete!";
        
    } catch (e) {
        log(`Sync Failed: ${e.message}`, "error");
        btnSync.textContent = "Sync Failed";
    } finally {
        setTimeout(() => {
            btnSync.disabled = false;
            if (btnSync.textContent === "Sync Complete!" || btnSync.textContent === "Sync Failed") {
                btnSync.textContent = "Sync Now";
            }
        }, 3000);
    }
});

function setStatus(el, text, isGood) {
    el.textContent = text;
    el.className = `status-value ${isGood ? 'connected' : 'error'}`;
}

// --- Credential Discovery ---

async function discoverHardcoverToken() {
    log("Checking Hardcover session...", "debug");
    try {
        const response = await fetch("https://hardcover.app/account/api", { credentials: 'include' });
        if (response.url.includes("login")) {
            setStatus(statusHardcover, "Login Required", false);
            log("Please log in to Hardcover.app in a new tab.", "error");
            return;
        }

        const html = await response.text();
        const match = html.match(/eyJ[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/);
        
        if (match) {
            HC_TOKEN = match[0];
            await chrome.storage.local.set({ hc_token: HC_TOKEN });
            setStatus(statusHardcover, "Detected", true);
            log("Reference found for Hardcover Token.", "success");
            // Enable button if RSS is also found
            if (HC_TOKEN && RSS_URL) btnSync.disabled = false;
        } else {
            console.log("HTML Preview:", html.substring(0, 500)); 
            setStatus(statusHardcover, "Not Found", false);
            log("Could not find API Token on account page.", "error");
        }
    } catch (e) {
        setStatus(statusHardcover, "Error", false);
        log(`Hardcover Check Error: ${e.message}`, "error");
    }
}

async function discoverGoodreadsRSS() {
    log("Checking Goodreads session...", "debug");
    try {
        log("Fetching Goodreads 'Read' shelf...", "debug");
        const response = await fetch("https://www.goodreads.com/review/list?shelf=read", { credentials: 'include' });
        
        if (response.url.includes("user/sign_in")) {
            setStatus(statusGoodreads, "Login Required", false);
            log("Please log in to Goodreads.com in a new tab.", "error");
            return;
        }
        
        log("Parsing Goodreads response...", "debug");
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        
        log("Scanning DOM for RSS link...", "debug");
        const rssLink = doc.querySelector('a[href*="/review/list_rss/"]');
        
        if (rssLink) {
            let href = rssLink.getAttribute('href');
            if (href.startsWith('/')) {
                href = `https://www.goodreads.com${href}`;
            }
            
            RSS_URL = href;
            await chrome.storage.local.set({ rss_url: RSS_URL });
            setStatus(statusGoodreads, "Detected", true);
            log("Reference found for Goodreads RSS.", "success");
            // Enable button if Token is also found
            if (HC_TOKEN && RSS_URL) btnSync.disabled = false;
        } else {
            setStatus(statusGoodreads, "Not Found", false);
            log("Could not find RSS link on Goodreads page. Make sure you are logged in.", "error");
        }

    } catch (e) {
        setStatus(statusGoodreads, "Error", false);
        log(`Goodreads Check Error: ${e.message}`, "error");
    }
}
