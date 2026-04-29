const fs = require("fs");
const path = require("path");

const LANGS = ["fr", "es", "de"];
const BASE_LANG = "en";

const FILES = [
  "common.json",
  "navigation.json",
  "anime.json",
  "user.json"
];

// load JSON
function load(lang, file) {
  const filePath = path.join(__dirname, `../locales/${lang}/${file}`);
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

// flatten keys
function getKeys(obj) {
  return Object.keys(obj).sort();
}

// compare
function diff(base, target) {
  const baseKeys = new Set(getKeys(base));
  const targetKeys = new Set(getKeys(target));

  const missing = [...baseKeys].filter(k => !targetKeys.has(k));
  const extra = [...targetKeys].filter(k => !baseKeys.has(k));

  return { missing, extra };
}

// main audit
function audit() {
  console.log("\n🔎 i18n AUDIT START\n");

  const report = {};

  for (const lang of LANGS) {
    console.log(`\n📦 Checking ${lang.toUpperCase()}...`);

    report[lang] = {};

    for (const file of FILES) {
      const base = load(BASE_LANG, file);
      const target = load(lang, file);

      const { missing, extra } = diff(base, target);

      report[lang][file] = { missing, extra };

      console.log(`\n📄 ${file}`);

      if (missing.length === 0 && extra.length === 0) {
        console.log("   ✅ OK");
      } else {
        if (missing.length) {
          console.log("   ❌ Missing keys:");
          missing.forEach(k => console.log(`      - ${k}`));
        }

        if (extra.length) {
          console.log("   ⚠️ Extra keys:");
          extra.forEach(k => console.log(`      + ${k}`));
        }
      }
    }
  }

  // export report
  fs.writeFileSync(
    path.join(__dirname, "../i18n-audit-report.json"),
    JSON.stringify(report, null, 2)
  );

  console.log("\n📊 Report saved: i18n-audit-report.json");
  console.log("\n✔ DONE\n");
}

audit();
