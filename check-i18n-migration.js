import fs from "fs";

// 🔥 CHARGE FICHIERS JS
const oldI18n = fs.readFileSync("./i18n.js", "utf-8");
const newI18n = fs.readFileSync("./js/i18n.js", "utf-8");

// 🌍 LANGUES
const langs = ["en", "fr", "es", "de"];

// 🔍 extraction clés simples (format "key":)
function extractKeys(text) {
  const matches = [...text.matchAll(/["'`]([\w.-]+)["'`]\s*:/g)];
  return [...new Set(matches.map(m => m[1]))];
}

// flatten JSON
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

// --- KEYS ---
const oldKeys = extractKeys(oldI18n);
const newKeys = extractKeys(newI18n);

// --- REPORT ---
function diff(a, b) {
  return a.filter(x => !b.includes(x));
}

console.log("\n=======================");
console.log("🔍 I18N MIGRATION CHECK");
console.log("=======================\n");

// OLD vs NEW
console.log("📌 Ancien i18n manquant dans nouveau :");
console.log(diff(oldKeys, newKeys));

// LANGS
for (const lang of langs) {
  const data = JSON.parse(fs.readFileSync(`./locales/${lang}.json`, "utf-8"));
  const keys = flatten(data);

  console.log(`\n🌍 ${lang.toUpperCase()}`);

  const missing = diff(newKeys, keys);

  if (missing.length === 0) {
    console.log("✔ OK");
  } else {
    console.log("❌ manquants :");
    missing.forEach(k => console.log(" - " + k));
  }
}
