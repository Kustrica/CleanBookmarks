// Validates _locales: same keys everywhere, consistent placeholders, every used key exists,
// and the manual-language path (i18n.js) formats every message without leftover $NAME$ tokens.
// Run: node scripts/check-locales.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const localesDir = path.join(root, "_locales");
const langs = fs.readdirSync(localesDir).sort();
const load = l => JSON.parse(fs.readFileSync(path.join(localesDir, l, "messages.json"), "utf8"));
const base = load("en");
const baseKeys = Object.keys(base).sort();
let errors = 0;
const fail = m => { errors++; console.error("ERROR:", m); };
const tokens = s => (s.match(/\$[A-Za-z0-9_@]+\$/g) || []).map(t => t.toLowerCase()).sort().join(",");

// i18n.js formatter in a sandbox
const sandbox = { window: {}, browser: { storage: {}, i18n: { getMessage: () => "" } } };
vm.runInNewContext(fs.readFileSync(path.join(root, "i18n.js"), "utf8"), sandbox);
const format = sandbox.window.formatI18nMessage;

for (const lang of langs) {
    const data = load(lang);
    const keys = Object.keys(data).sort();
    for (const k of baseKeys) if (!(k in data)) fail(`${lang}: missing ${k}`);
    for (const k of keys) if (!(k in base)) fail(`${lang}: extra ${k}`);
    for (const k of keys) {
        const e = data[k];
        if (!e || typeof e.message !== "string" || !e.message.trim()) { fail(`${lang}.${k}: empty`); continue; }
        if (base[k] && tokens(e.message) !== tokens(base[k].message)) fail(`${lang}.${k}: placeholders differ from en`);
        for (const t of e.message.match(/\$[A-Za-z0-9_@]+\$/g) || []) {
            const name = t.slice(1, -1).toLowerCase();
            const ph = Object.fromEntries(Object.entries(e.placeholders || {}).map(([n, v]) => [n.toLowerCase(), v]));
            if (!ph[name]) fail(`${lang}.${k}: ${t} has no placeholder definition`);
        }
        const out = format(e, ["7"]);
        if (/\$[A-Za-z0-9_@]+\$/.test(out)) fail(`${lang}.${k}: unresolved placeholder in "${out}"`);
        if (e.placeholders && !out.includes("7")) fail(`${lang}.${k}: substitution missing in "${out}"`);
    }
}

// Every key used in code/markup exists in en
const used = new Set();
for (const f of ["options.html", "options.js", "background.js", "manifest.json"]) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    for (const m of src.matchAll(/data-i18n(?:-title)?="([^"]+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/(?:getMessage|msg)\(\s*"([A-Za-z0-9_]+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) used.add(m[1]);
}
for (const k of used) if (!(k in base)) fail(`used key "${k}" is missing in en`);
for (const k of baseKeys) if (!used.has(k)) console.warn(`warning: key "${k}" is not used`);

console.log(`${langs.length} locales, ${baseKeys.length} keys, ${used.size} used keys, ${errors} error(s)`);
process.exit(errors ? 1 : 0);
