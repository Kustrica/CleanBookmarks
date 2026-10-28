if (typeof browser === "undefined") {
    var browser = chrome;
}

// Keep in sync with DEFAULT_SETTINGS in background.js
const DEFAULT_SETTINGS = {
    hideUrlLike: true,
    autoHideNew: true,
    scanOnStartup: true,
    showAddMenu: true,
    addPosition: "end",
    addIconOnly: false
};

function msg(key, params) {
    return (window.getMessage ? window.getMessage(key, params) : browser.i18n.getMessage(key, params)) || "";
}

function localizePage() {
    document.querySelectorAll("[data-i18n]").forEach(el => {
        const text = msg(el.getAttribute("data-i18n"));
        if (text) el.textContent = text;
    });
    const titleMsg = msg("optionsTitle");
    if (titleMsg) document.title = titleMsg;
    const langSelect = document.getElementById("ui-language-select");
    const uiLang = langSelect?.value || "auto";
    const resolved = uiLang === "auto"
        ? (browser.i18n?.getUILanguage?.() || "en")
        : uiLang.replace("_", "-");
    const base = resolved.split("-")[0];
    document.documentElement.lang = base;
    document.documentElement.dir = base === "ar" ? "rtl" : "ltr";
}

let statusTimer = null;
function showStatus(text) {
    const el = document.getElementById("status-msg");
    el.textContent = text;
    el.className = "success";
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { el.className = ""; }, 2200);
}

function bindLanguageSelect() {
    const langSelect = document.getElementById("ui-language-select");
    if (!langSelect) return;
    langSelect.addEventListener("change", () => {
        browser.storage.local.set({ ui_language: langSelect.value }).then(() => {
            showStatus(msg("languageUpdated") || "Language updated. Reloading...");
            setTimeout(() => location.reload(), 800);
        });
    });
}

function updatePreview(hideUrlLike) {
    document.getElementById("preview-url-hidden").classList.toggle("hidden", !hideUrlLike);
    document.getElementById("preview-url-kept").classList.toggle("hidden", hideUrlLike);
}

function updateAddOptionsState(showAddMenu) {
    document.getElementById("add-options").classList.toggle("is-disabled", !showAddMenu);
}

let iconOnlyCount = 0;
async function refreshStats() {
    try {
        const res = await browser.runtime.sendMessage({ action: "GET_STATS" });
        iconOnlyCount = res && typeof res.count === "number" ? res.count : 0;
    } catch (e) {
        iconOnlyCount = 0;
    }
    document.getElementById("icon-only-count").textContent = msg("iconOnlyCount", [String(iconOnlyCount)]);
    document.getElementById("restore-btn").disabled = iconOnlyCount === 0;
}

function save(values) {
    return browser.storage.local.set(values).then(() => showStatus(msg("saved") || "Saved"));
}

async function loadSettings() {
    const s = await browser.storage.local.get(DEFAULT_SETTINGS);
    document.getElementById("hide-url-like").checked = s.hideUrlLike;
    document.getElementById("auto-hide-new").checked = s.autoHideNew;
    document.getElementById("scan-on-startup").checked = s.scanOnStartup;
    document.getElementById("show-add-menu").checked = s.showAddMenu;
    document.getElementById("add-icon-only").checked = s.addIconOnly;
    document.getElementById(s.addPosition === "start" ? "add-position-start" : "add-position-end").checked = true;
    updatePreview(s.hideUrlLike);
    updateAddOptionsState(s.showAddMenu);
}

function bindCheckbox(id, key, after) {
    const el = document.getElementById(id);
    el.addEventListener("change", () => {
        save({ [key]: el.checked });
        if (after) after(el.checked);
    });
}

function bindControls() {
    bindCheckbox("hide-url-like", "hideUrlLike", updatePreview);
    bindCheckbox("auto-hide-new", "autoHideNew");
    bindCheckbox("scan-on-startup", "scanOnStartup");
    bindCheckbox("show-add-menu", "showAddMenu", updateAddOptionsState);
    bindCheckbox("add-icon-only", "addIconOnly");
    document.querySelectorAll('input[name="add-position"]').forEach(radio => {
        radio.addEventListener("change", () => {
            if (radio.checked) save({ addPosition: radio.value });
        });
    });

    const forceBtn = document.getElementById("force-scan-btn");
    forceBtn.addEventListener("click", async () => {
        forceBtn.disabled = true;
        try {
            const res = await browser.runtime.sendMessage({ action: "FORCE_SCAN" });
            const count = res && res.count ? res.count : 0;
            showStatus(count > 0 ? msg("hiddenCountMsg", [String(count)]) : msg("nothingToHideMsg"));
        } finally {
            forceBtn.disabled = false;
            refreshStats();
        }
    });

    const confirmBox = document.getElementById("restore-confirm");
    document.getElementById("restore-btn").addEventListener("click", () => {
        document.getElementById("restore-confirm-text").textContent = msg("restoreConfirm", [String(iconOnlyCount)]);
        confirmBox.classList.remove("hidden");
    });
    document.getElementById("restore-no").addEventListener("click", () => confirmBox.classList.add("hidden"));
    document.getElementById("restore-yes").addEventListener("click", async () => {
        confirmBox.classList.add("hidden");
        try {
            const res = await browser.runtime.sendMessage({ action: "RESTORE_TITLES" });
            const count = res && res.count ? res.count : 0;
            showStatus(msg("restoredCountMsg", [String(count)]));
        } finally {
            await loadSettings();
            refreshStats();
        }
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    const { ui_language } = await browser.storage.local.get({ ui_language: "auto" });
    const langSelect = document.getElementById("ui-language-select");
    if (langSelect) langSelect.value = ui_language || "auto";

    if (window.initI18n) await window.initI18n();
    localizePage();
    bindLanguageSelect();
    await loadSettings();
    bindControls();
    refreshStats();
});
