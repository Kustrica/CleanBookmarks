if (typeof browser === "undefined") {
    var browser = chrome;
}

const INVISIBLE_CHAR = "\u200B";

// Normalize strings for URL-like comparison
function normalizeString(str) {
    if (!str) return "";
    try {
        let urlStr = str;
        if (!urlStr.startsWith('http')) {
            urlStr = 'http://' + urlStr;
        }
        const url = new URL(urlStr);
        let hostname = url.hostname.replace(/^www\./, '');
        let path = url.pathname;
        if (path.endsWith('/')) path = path.slice(0, -1);
        return hostname + path + url.search;
    } catch (e) {
        return str.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
    }
}

// Read enabled flag from storage
async function isEnabled() {
    const data = await browser.storage.local.get({ enabled: true });
    return data.enabled;
}

const ADD_CURRENT_PAGE_MENU_ID = "add_current_page_to_folder";

// Read active tab title and url
async function getActiveTabInfo() {
    try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const tab = tabs && tabs[0];
        if (!tab || !tab.url) return null;
        return { title: tab.title || tab.url, url: tab.url };
    } catch (e) {
        return null;
    }
}

// Resolve a bookmark folder id from a bookmark node or folder
async function resolveBookmarkParentId(bookmarkId) {
    try {
        const results = await browser.bookmarks.get(bookmarkId);
        if (!results || results.length === 0) return null;
        const node = results[0];
        return node.url ? node.parentId : node.id;
    } catch (e) {
        return null;
    }
}

// Create a bookmark for the active tab
async function createBookmarkFromActiveTab(parentId) {
    if (!(await isEnabled())) return;
    const tabInfo = await getActiveTabInfo();
    if (!tabInfo) return;
    const payload = { title: tabInfo.title, url: tabInfo.url };
    if (parentId) payload.parentId = parentId;
    try {
        await browser.bookmarks.create(payload);
    } catch (e) {}
}

// Register bookmark context menu entry
function registerContextMenus() {
    if (!browser.contextMenus) return;
    browser.contextMenus.removeAll().then(() => {
        browser.contextMenus.create({
            id: ADD_CURRENT_PAGE_MENU_ID,
            title: browser.i18n.getMessage("addBookmarkMenu") || "Add Bookmark",
            contexts: ["bookmark"]
        });
    }).catch(() => {});
}

// Update bookmark titles based on current rules
async function updateBookmarkIfNeeded(id, bookmark) {
    if (!(await isEnabled())) return;

    const title = bookmark.title;
    if (!title || title.trim() === "") {
        console.log("Empty title found, fixing:", bookmark.url);
        browser.bookmarks.update(id, { title: INVISIBLE_CHAR }).catch(() => {});
        return;
    }
    if (bookmark.url) {
        const normTitle = normalizeString(title);
        const normUrl = normalizeString(bookmark.url);
        if (title === bookmark.url || normTitle === normUrl) {
             console.log("URL-like title found, fixing:", title);
             browser.bookmarks.update(id, { title: INVISIBLE_CHAR }).catch(() => {});
        }
    }
}

// Scan all bookmark nodes recursively
function scanBookmarks(nodes) {
    for (let node of nodes) {
        if (node.url) {
            updateBookmarkIfNeeded(node.id, node);
        }
        
        if (node.children) {
            scanBookmarks(node.children);
        }
    }
}

browser.runtime.onStartup.addListener(async () => {
    registerContextMenus();
    if (await isEnabled()) {
        browser.bookmarks.getTree().then(scanBookmarks);
    }
});

browser.runtime.onInstalled.addListener(async () => {
    console.log("FaviconBookmarks Installed/Updated - Scanning...");
    registerContextMenus();
    if (await isEnabled()) {
        browser.bookmarks.getTree().then(scanBookmarks);
    }
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "FORCE_SCAN") {
        browser.bookmarks.getTree().then(scanBookmarks);
    }
});

if (browser.contextMenus && browser.contextMenus.onClicked) {
    browser.contextMenus.onClicked.addListener(async (info) => {
        if (info.menuItemId !== ADD_CURRENT_PAGE_MENU_ID) return;
        const parentId = info.bookmarkId ? await resolveBookmarkParentId(info.bookmarkId) : null;
        createBookmarkFromActiveTab(parentId);
    });
}

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

browser.action.onClicked.addListener(() => {
    browser.runtime.openOptionsPage().catch(() => {});
});
