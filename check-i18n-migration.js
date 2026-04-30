const fs = require("fs");

// 🔥 CHARGE FICHIERS JS (on les lit en texte)
const oldI18n = fs.readFileSync("./i18n.js", "utf-8");
const newI18n = fs.readFileSync("./js/i18n.js", "utf-8");

// 📦 CHARGE JSON LANGUES
const langs = ["en", "fr", "es", "de"];

function loadJSON(lang) {
  return JSON.parse(fs.readFileSync(`./locales/${lang.json}`, "utf-8"));
}

// 🔍 EXTRACTION SIMPLE DES CLÉS (regex basique)
function extractKeys(text) {
  const matches = [...text.matchAll(/["'`]([\w.-]+)["'`]\s*:/g)];
  return [...new Set(matches.map(m => m[1]))];
}

// flatten JSON keys
function flatten(obj, prefix = "") {
  let keys = [];
  for (let k in obj) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof obj[k] === "object") {
      keys = keys.concat(flatten(obj[k], path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

// --- OLD / NEW KEYS ---
const oldKeys = extractKeys(oldI18n);
const newKeys = extractKeys(newI18n);

// --- LANG KEYS ---
const langKeys = {};
for (const lang of langs) {
  const data = JSON.parse(fs.readFileSync(`./locales/${lang}.json`, "utf-8"));
  langKeys[lang] = flatten(data);
}

// --- REPORT ---
function diff(a, b) {
  return a.filter(x => !b.includes(x));
}

console.log("\n=======================");
console.log("🔍 I18N MIGRATION CHECK");
console.log("=======================\n");

// OLD vs NEW
console.log("📌 Clés présentes dans ancien i18n mais absentes du nouveau :");
console.log(diff(oldKeys, newKeys));

// NEW vs LANGS
for (const lang of langs) {
  console.log(`\n🌍 Vérif langue ${lang.toUpperCase()}`);

  const missing = diff(newKeys, langKeys[lang]);
  if (missing.length === 0) {
    console.log("✔ OK");
  } else {
    console.log("❌ Clés manquantes :");
    missing.forEach(k => console.log(" - " + k));
  }
}
