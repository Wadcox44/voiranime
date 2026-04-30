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

// 📦 charge i18n
const i18nRaw = fs.readFileSync("./js/i18n.js", "utf-8");

// 🔍 extrait clés depuis i18n.js
function extractKeys(text) {
  const matches = [...text.matchAll(/["'`]([\w.-]+)["'`]\s*:/g)];
  return [...new Set(matches.map(m => m[1]))];
}

const i18nKeys = extractKeys(i18nRaw);

// 🔍 extrait data-i18n dans HTML
function extractFromHTML(file) {
  const content = fs.readFileSync(file, "utf-8");
  const matches = [...content.matchAll(/data-i18n=["'`]([^"'`]+)["'`]/g)];
  return matches.map(m => m[1]);
}

// 📊 collect HTML keys
let htmlKeys = [];

for (const file of HTML_FILES) {
  if (!fs.existsSync(file)) continue;
  htmlKeys = htmlKeys.concat(extractFromHTML(file));
}

htmlKeys = [...new Set(htmlKeys)];

// 🔥 DIFF
const missingInI18n = htmlKeys.filter(k => !i18nKeys.includes(k));
const unusedInHTML = i18nKeys.filter(k => !htmlKeys.includes(k));

// 📊 REPORT
console.log("\n==============================");
console.log("🔍 I18N FULL PROJECT SCANNER");
console.log("==============================\n");

console.log("📌 Clés utilisées dans HTML :", htmlKeys.length);
console.log("📌 Clés dans i18n.js :", i18nKeys.length);

console.log("\n❌ MANQUANTES dans i18n.js :");
console.log(missingInI18n.length ? missingInI18n : "✔ aucune");

console.log("\n⚠️ NON UTILISÉES dans HTML :");
console.log(unusedInHTML.length ? unusedInHTML : "✔ aucune");

console.log("\n==============================\n");
