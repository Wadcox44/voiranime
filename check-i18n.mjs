import fs from "fs";

const HTML_FILES = [
  "anime.html",
  "catalogue.html",
  "duel.html",
  "favorites.html",
  "history.html",
  "index.html",
  "news.html",
  "profile.html",
  "ratings.html",
  "soutenir.html"
];

const LANGS = ["en", "fr", "es", "de"];
const FILES = ["common.json", "navigation.json", "anime.json", "user.json"];

// 🔍 HTML KEYS
function extractHTML(file) {
  const content = fs.readFileSync(file, "utf-8");
  const matches = [...content.matchAll(/data-i18n=["'`]([^"'`]+)["'`]/g)];
  return matches.map(m => m[1]);
}

// 🔍 JSON KEYS (flat)
function flatten(obj, prefix = "") {
  let keys = [];
  for (const k in obj) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof obj[k] === "object") {
      keys = keys.concat(flatten(obj[k], path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

// 🔍 LOAD LANG FILES
function loadLang(lang) {
  let merged = {};

  for (const file of FILES) {
    const path = `./locales/${lang}/${file}`;
    if (!fs.existsSync(path)) continue;

    const data = JSON.parse(fs.readFileSync(path, "utf-8"));
    merged = { ...merged, ...data };
  }

  return flatten(merged);
}

// 📦 HTML KEYS
let htmlKeys = [];
for (const file of HTML_FILES) {
  if (!fs.existsSync(file)) continue;
  htmlKeys = htmlKeys.concat(extractHTML(file));
}
htmlKeys = [...new Set(htmlKeys)];

// 📦 LANG KEYS
const langKeys = {};
for (const lang of LANGS) {
  langKeys[lang] = loadLang(lang);
}

// 🔥 DIFF
function diff(a, b) {
  return a.filter(x => !b.includes(x));
}

// 📊 REPORT
console.log("\n==============================");
console.log("🔍 I18N FULL AUDIT (FIXED)");
console.log("==============================\n");

console.log("📌 HTML keys:", htmlKeys.length);

for (const lang of LANGS) {
  console.log(`\n🌍 ${lang.toUpperCase()}`);

  const missing = diff(htmlKeys, langKeys[lang]);

  if (missing.length === 0) {
    console.log("✔ OK");
  } else {
    console.log("❌ manquants :");
    missing.forEach(k => console.log(" - " + k));
  }
}
