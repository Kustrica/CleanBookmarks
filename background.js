if (typeof browser === "undefined") {
    var browser = chrome;
}

const INVISIBLE_CHAR = "\u200B";
const ADD_CURRENT_PAGE_MENU_ID = "add_current_page_to_folder";

// Keep in sync with DEFAULT_SETTINGS in options.js
const DEFAULT_SETTINGS = {
    hideUrlLike: true,      // also hide titles that only repeat the address
    autoHideNew: true,      // check new and renamed bookmarks right away
    scanOnStartup: true,    // check every bookmark at browser start / install / update
    showAddMenu: true,      // "Add bookmark" item in the bookmark context menu
    addPosition: "end",     // "end" | "start" when adding into a folder
    addIconOnly: false      // save quick-added bookmarks without a visible title
};

// Bookmark ids whose titles we are changing ourselves (skip them in onChanged)
const selfUpdating = new Set();

async function getSettings() {
    try {
        return await browser.storage.local.get(DEFAULT_SETTINGS);
    } catch (e) {
        return { ...DEFAULT_SETTINGS };
    }
}

// Normalize strings for URL-like comparison
function normalizeString(str) {
    if (!str) return "";
    try {
        let urlStr = str.trim();
        if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(urlStr)) {
            urlStr = "http://" + urlStr;
        }
        const url = new URL(urlStr);
        const hostname = url.hostname.replace(/^www\./, "");
        let path = url.pathname;
        if (path.endsWith("/")) path = path.slice(0, -1);
        return (hostname + path + url.search).toLowerCase();
    } catch (e) {
        return str.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "").toLowerCase();
    }
}

// Should this bookmark get an invisible title?
function needsHiding(bookmark, settings) {
    if (!bookmark || !bookmark.url) return false;
    const title = bookmark.title;
    if (title === INVISIBLE_CHAR) return false;
    if (!title || title.trim() === "") return true;
    if (!settings.hideUrlLike) return false;
    return title === bookmark.url || normalizeString(title) === normalizeString(bookmark.url);
}

async function setTitle(id, title) {
    selfUpdating.add(id);
    try {
        await browser.bookmarks.update(id, { title });
        return true;
    } catch (e) {
        return false;
    } finally {
        setTimeout(() => selfUpdating.delete(id), 1000);
    }
}

function collectBookmarks(nodes, out = []) {
    for (const node of nodes) {
        if (node.url) out.push(node);
        if (node.children) collectBookmarks(node.children, out);
    }
    return out;
}

async function getAllBookmarks() {
    try {
        return collectBookmarks(await browser.bookmarks.getTree());
    } catch (e) {
        return [];
    }
}

// Hide every nameless title; returns how many were changed
async function scanAll() {
    const settings = await getSettings();
    let changed = 0;
    for (const node of await getAllBookmarks()) {
        if (needsHiding(node, settings) && await setTitle(node.id, INVISIBLE_CHAR)) changed++;
    }
    return changed;
}

async function countIconOnly() {
    return (await getAllBookmarks()).filter(node => node.title === INVISIBLE_CHAR).length;
}

// A readable title for a restored bookmark: host + path, without protocol and www.
function readableTitle(urlString) {
    try {
        const url = new URL(urlString);
        if (url.protocol === "http:" || url.protocol === "https:") {
            let path = url.pathname;
            if (path.endsWith("/")) path = path.slice(0, -1);
            return url.hostname.replace(/^www\./, "") + path;
        }
    } catch (e) {}
    return urlString;
}

// Give icon-only bookmarks a visible title again. Automatic checks are switched off
// first, otherwise the restored titles would be hidden again.
async function restoreAll() {
    await browser.storage.local.set({ autoHideNew: false, scanOnStartup: false });
    let restored = 0;
    for (const node of await getAllBookmarks()) {
        if (node.title !== INVISIBLE_CHAR) continue;
        if (await setTitle(node.id, readableTitle(node.url))) restored++;
    }
    return restored;
}

async function checkBookmark(id, bookmark) {
    const settings = await getSettings();
    if (!settings.autoHideNew) return;
    if (needsHiding(bookmark, settings)) await setTitle(id, INVISIBLE_CHAR);
}

// ---------- Quick add ----------

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

// Right-clicked folder -> into the folder; right-clicked bookmark -> right after it
async function resolveTarget(bookmarkId, settings) {
    if (!bookmarkId) return {};
    try {
        const [node] = await browser.bookmarks.get(bookmarkId);
        if (!node) return {};
        if (node.type === "separator" || node.url) {
            return { parentId: node.parentId, index: node.index + 1 };
        }
        return settings.addPosition === "start" ? { parentId: node.id, index: 0 } : { parentId: node.id };
    } catch (e) {
        return {};
    }
}

async function addCurrentTab(bookmarkId) {
    const settings = await getSettings();
    const tabInfo = await getActiveTabInfo();
    if (!tabInfo) return;
    const target = await resolveTarget(bookmarkId, settings);
    const payload = {
        title: settings.addIconOnly ? INVISIBLE_CHAR : tabInfo.title,
        url: tabInfo.url,
        ...target
    };
    try {
        await browser.bookmarks.create(payload);
    } catch (e) {}
}

let menuQueue = Promise.resolve();

// (Re)build the context menu in the chosen interface language
function registerContextMenus() {
    menuQueue = menuQueue.then(async () => {
        if (!browser.contextMenus) return;
        try {
            if (window.initI18n) await window.initI18n();
        } catch (e) {}
        const settings = await getSettings();
        await browser.contextMenus.removeAll().catch(() => {});
        if (!settings.showAddMenu) return;
        browser.contextMenus.create({
            id: ADD_CURRENT_PAGE_MENU_ID,
            title: window.getMessage("addBookmarkMenu") || "Add bookmark",
            contexts: ["bookmark"]
        });
    }).catch(() => {});
    return menuQueue;
}

browser.runtime.onStartup.addListener(async () => {
    registerContextMenus();
    if ((await getSettings()).scanOnStartup) scanAll();
});

browser.runtime.onInstalled.addListener(async () => {
    registerContextMenus();
    if ((await getSettings()).scanOnStartup) scanAll();
});

browser.runtime.onMessage.addListener(message => {
    if (!message) return undefined;
    if (message.action === "FORCE_SCAN") return scanAll().then(count => ({ count }));
    if (message.action === "RESTORE_TITLES") return restoreAll().then(count => ({ count }));
    if (message.action === "GET_STATS") return countIconOnly().then(count => ({ count }));
    return undefined;
});

browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.ui_language || changes.showAddMenu) registerContextMenus();
});

if (browser.contextMenus && browser.contextMenus.onClicked) {
    browser.contextMenus.onClicked.addListener(info => {
        if (info.menuItemId !== ADD_CURRENT_PAGE_MENU_ID) return;
        addCurrentTab(info.bookmarkId);
    });
}

browser.bookmarks.onCreated.addListener((id, bookmark) => {
    checkBookmark(id, bookmark);
});

browser.bookmarks.onChanged.addListener((id, changeInfo) => {
    if (changeInfo.title === undefined || changeInfo.title === INVISIBLE_CHAR) return;
    if (selfUpdating.has(id)) return;
    // onChanged doesn't always include the URL, so fetch the bookmark to compare
    browser.bookmarks.get(id).then(bookmarks => {
        if (bookmarks && bookmarks.length > 0) checkBookmark(id, bookmarks[0]);
    }).catch(() => {});
});

browser.action.onClicked.addListener(() => {
    browser.runtime.openOptionsPage().catch(() => {});
});
