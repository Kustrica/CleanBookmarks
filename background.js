if (typeof browser === "undefined") {
    var browser = chrome;
}

// background.js

// The invisible character (Zero Width Space)
const INVISIBLE_CHAR = "\u200B";

// Helper to clean strings for comparison (remove protocol, www, trailing slash)
function normalizeString(str) {
    if (!str) return "";
    try {
        // If it looks like a URL, parse it
        // Add protocol if missing to satisfy URL constructor
        let urlStr = str;
        if (!urlStr.startsWith('http')) {
            urlStr = 'http://' + urlStr;
        }
        const url = new URL(urlStr);
        let hostname = url.hostname.replace(/^www\./, '');
        let path = url.pathname;
        if (path.endsWith('/')) path = path.slice(0, -1);
        
        // Return domain + path (e.g. google.com or google.com/maps)
        return hostname + path + url.search;
    } catch (e) {
        // Fallback: just simple strip
        return str.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
    }
}

async function isEnabled() {
    const data = await browser.storage.local.get({ enabled: true });
    return data.enabled;
}

async function updateBookmarkIfNeeded(id, bookmark) {
    if (!(await isEnabled())) return;

    const title = bookmark.title;
    
    // 1. If title is empty/whitespace -> replace with invisible char
    if (!title || title.trim() === "") {
        console.log("Empty title found, fixing:", bookmark.url);
        browser.bookmarks.update(id, { title: INVISIBLE_CHAR }).catch(() => {});
        return;
    }
    
    // 2. Check if title is suspiciously similar to the URL
    // e.g. title="https://google.com/" and url="https://google.com/"
    // or title="google.com" and url="https://www.google.com/"
    if (bookmark.url) {
        const normTitle = normalizeString(title);
        const normUrl = normalizeString(bookmark.url);
        
        // Also check raw equality just in case
        if (title === bookmark.url || normTitle === normUrl) {
             console.log("URL-like title found, fixing:", title);
             browser.bookmarks.update(id, { title: INVISIBLE_CHAR }).catch(() => {});
        }
    }
}

// Recursive function to scan all bookmark nodes
function scanBookmarks(nodes) {
    for (let node of nodes) {
        if (node.url) {
            // It's a bookmark
            updateBookmarkIfNeeded(node.id, node);
        }
        
        if (node.children) {
            // It's a folder
            scanBookmarks(node.children);
        }
    }
}

// 1. Scan on startup
browser.runtime.onStartup.addListener(async () => {
    if (await isEnabled()) {
        browser.bookmarks.getTree().then(scanBookmarks);
    }
});

// 2. Scan on install/update (so it works immediately after loading extension)
browser.runtime.onInstalled.addListener(async () => {
    console.log("FaviconBookmarks Installed/Updated - Scanning...");
    if (await isEnabled()) {
        browser.bookmarks.getTree().then(scanBookmarks);
    }
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "FORCE_SCAN") {
        browser.bookmarks.getTree().then(scanBookmarks);
    }
});

browser.bookmarks.onCreated.addListener((id, bookmark) => {
    updateBookmarkIfNeeded(id, bookmark);
});

browser.bookmarks.onChanged.addListener((id, changeInfo) => {
    if (changeInfo.title !== undefined) {
        if (changeInfo.title === INVISIBLE_CHAR) return;
        
        // We need URL to check if title === url, but onChanged only gives us title/url if they changed.
        // If only title changed, we don't get URL in changeInfo.
        // So we must fetch the bookmark to be sure.
        browser.bookmarks.get(id).then(bookmarks => {
            if (bookmarks && bookmarks.length > 0) {
                updateBookmarkIfNeeded(id, bookmarks[0]);
            }
        });
    }
});
