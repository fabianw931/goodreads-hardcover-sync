/**
 * Hardcover Sync Content Script
 * Handles the display of the sync modal on the page.
 */

let overlay = null;
let bodyContainer = null;
let logContainer = null;
let syncButton = null;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'SHOW_MODAL') {
        createModal(request.data);
    } else if (request.action === 'UPDATE_LOG') {
        if (logContainer) {
            logContainer.style.display = 'block';
            const div = document.createElement('div');
            div.className = 'hc-log-entry ' + (request.type === 'error' ? 'hc-log-error' : 'hc-log-success');
            div.textContent = request.message;
            logContainer.appendChild(div);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    } else if (request.action === 'SYNC_COMPLETE') {
        if (syncButton) {
            syncButton.textContent = "Done";
            setTimeout(() => removeModal(), 5000);
        }
    } else if (request.action === 'SHOW_SETUP_REQUIRED') {
        createSetupModal(request.data);
    }
});

function createSetupModal(data) {
    if (document.getElementById('hc-sync-modal-overlay')) return;

    const missingItems = [];
    if (data.missingHardcover) missingItems.push("Hardcover Token");
    if (data.missingGoodreads) {
        let msg = "Goodreads Connection";
        if (data.goodreadsError) msg += ` (${data.goodreadsError})`;
        missingItems.push(msg);
    }

    const html = `
        <div id="hc-sync-header">
            <span>Hardcover Sync</span>
            <button id="hc-sync-close">×</button>
        </div>
        <div id="hc-sync-body">
            <p class="hc-sync-text">
                ⚠️ <strong>Sync Not Configured</strong><br>
                Please open the extension popup to connect:
                <br><span style="font-size: 0.9em; color: #ef4444;">Missing: ${missingItems.join(", ")}</span>
            </p>
            <button id="hc-btn-dismiss" class="hc-btn secondary">Dismiss</button>
        </div>
    `;

    overlay = document.createElement('div');
    overlay.id = 'hc-sync-modal-overlay';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    document.getElementById('hc-sync-close').addEventListener('click', removeModal);
    document.getElementById('hc-btn-dismiss').addEventListener('click', removeModal);
}

function createModal(data) {
    if (document.getElementById('hc-sync-modal-overlay')) return; // Already Open

    // HTML Structure
    const html = `
        <div id="hc-sync-header">
            <span>Hardcover Sync</span>
            <button id="hc-sync-close">×</button>
        </div>
        <div id="hc-sync-body">
            <p class="hc-sync-text">
                Found <strong>${data.newCount}</strong> new books from Kindle/Goodreads.
            </p>
            <button id="hc-btn-sync" class="hc-btn">Sync Now</button>
            <div class="hc-log-container" id="hc-log-console"></div>
            <button id="hc-btn-dismiss" class="hc-btn secondary">Dismiss for now</button>
        </div>
    `;

    overlay = document.createElement('div');
    overlay.id = 'hc-sync-modal-overlay';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    // Bind Events
    document.getElementById('hc-sync-close').addEventListener('click', removeModal);
    document.getElementById('hc-btn-dismiss').addEventListener('click', removeModal);
    
    syncButton = document.getElementById('hc-btn-sync');
    syncButton.addEventListener('click', () => {
        syncButton.disabled = true;
        syncButton.textContent = "Syncing...";
        chrome.runtime.sendMessage({ action: "START_SYNC" });
    });

    logContainer = document.getElementById('hc-log-console');
}

function removeModal() {
    if (overlay) {
        overlay.remove();
        overlay = null;
    }
}
