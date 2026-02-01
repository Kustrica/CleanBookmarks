function localizePage() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        const msg = chrome.i18n.getMessage(key);
        if (msg) el.textContent = msg;
    });
}

function showStatus(msg, type = 'success') {
    const el = document.getElementById('status-msg');
    el.textContent = msg;
    el.className = type;
    el.style.opacity = 1;
    setTimeout(() => {
        el.style.opacity = 0;
    }, 2000);
}

document.addEventListener('DOMContentLoaded', async () => {
    localizePage();

    const forceBtn = document.getElementById('force-scan-btn');
    
    forceBtn.addEventListener('click', async () => {
        // Send message to background script to trigger scan
        chrome.runtime.sendMessage({ action: "FORCE_SCAN" });
        showStatus(chrome.i18n.getMessage("hiddenMsg") || "Hidden");
    });
});