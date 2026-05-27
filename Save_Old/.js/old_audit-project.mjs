import fs from "fs";
import path from "path";

// 📁 CONFIG
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

const LOCALES = ["en", "fr", "es", "de"];
const LANG_PATH = "./locales";

// 🔍 HTML KEYS
function extractHTML(file) {
  if (!fs.existsSync(file)) return [];
  const content = fs.readFileSync(file, "utf-8");
  const matches = [...content.matchAll(/data-i18n=["'`]([^"'`]+)["'`]/g)];
  return matches.map(m => m[1]);
}

// 🔍 JSON flatten
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

// 📦 LOAD LOCALES
function loadLocale(lang) {
  const files = fs.readdirSync(`${LANG_PATH}/${lang}`);
  let merged = {};

  for (const file of files) {
    if (!file.endsWith(".json")) continue;

    const data = JSON.parse(
      fs.readFileSync(`${LANG_PATH}/${lang}/${file}`, "utf-8")
    );

    merged = { ...merged, ...data };
  }

  return flatten(merged);
}

// 🔥 HTML KEYS
let htmlKeys = [];
for (const file of HTML_FILES) {
  htmlKeys = htmlKeys.concat(extractHTML(file));
}
htmlKeys = [...new Set(htmlKeys)];

// 🔥 LOCALES KEYS
const localeKeys = {};
for (const lang of LOCALES) {
  localeKeys[lang] = loadLocale(lang);
}

// 🔍 DETECT CODE MORT JS
function scanJS(pattern) {
  const files = fs.readdirSync("./js");
  let results = [];

  for (const file of files) {
    const content = fs.readFileSync(`./js/${file}`, "utf-8");
    if (content.includes(pattern)) {
    results.push(`./js/${file}`);
    }
  }

  return results;
}

// 📊 DIFF
function diff(a, b) {
  return a.filter(x => !b.includes(x));
}

// =========================
// 📊 REPORT
// =========================

console.log("\n==============================");
console.log("🔍 FULL PROJECT AUDIT");
console.log("==============================\n");

// HTML
console.log("📌 HTML keys:", htmlKeys.length);

// LANGS
for (const lang of LOCALES) {
  const missing = diff(htmlKeys, localeKeys[lang]);

  console.log(`\n🌍 ${lang.toUpperCase()}`);

  if (missing.length === 0) {
    console.log("✔ OK");
  } else {
    console.log("❌ missing:");
    missing.forEach(k => console.log(" - " + k));
  }
}

// CODE MORT JS
console.log("\n🧹 CODE MORT DETECTION");

// anciens systèmes
const setLangFiles = scanJS("setLang");
const i18nFiles = scanJS("i18n.js");

console.log("setLang trouvé dans :", setLangFiles);
console.log("i18n mentionné dans :", i18nFiles);

console.log("\n==============================\n");
