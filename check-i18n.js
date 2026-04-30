const fs = require("fs");

const base = JSON.parse(fs.readFileSync("./locales/en.json", "utf-8"));

const langs = ["fr", "es", "de"];

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

const baseKeys = flatten(base);

langs.forEach(lang => {
  const file = JSON.parse(fs.readFileSync(`./locales/${lang}.json`, "utf-8"));
  const keys = flatten(file);

  const missing = baseKeys.filter(k => !keys.includes(k));

  console.log(`\n=== ${lang.toUpperCase()} ===`);
  if (missing.length === 0) {
    console.log("✔ OK - aucune clé manquante");
  } else {
    console.log("❌ Clés manquantes :");
    missing.forEach(k => console.log(" - " + k));
  }
});
