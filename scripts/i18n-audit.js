import fs from "fs";
import path from "path";

const __dirname = path.resolve();

const LANGS = ["fr", "es", "de"];
const BASE_LANG = "en";

const FILES = [
  "common.json",
  "navigation.json",
  "anime.json",
  "user.json"
];

function load(lang, file) {
  const filePath = path.join(__dirname, `locales/${lang}/${file}`);
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function getKeys(obj) {
  return Object.keys(obj).sort();
}

function diff(base, target) {
  const baseKeys = new Set(getKeys(base));
  const targetKeys = new Set(getKeys(target));

  const missing = [...baseKeys].filter(k => !targetKeys.has(k));
  const extra = [...targetKeys].filter(k => !baseKeys.has(k));

  return { missing, extra };
}

function audit() {
  console.log("\n🔎 i18n AUDIT START\n");

  for (const lang of LANGS) {
    console.log(`\n📦 ${lang.toUpperCase()}`);

    for (const file of FILES) {
      const base = load(BASE_LANG, file);
      const target = load(lang, file);

      const { missing, extra } = diff(base, target);

      console.log(`\n📄 ${file}`);

      if (!missing.length && !extra.length) {
        console.log("   ✅ OK");
      } else {
        if (missing.length) {
          console.log("   ❌ Missing:");
          missing.forEach(k => console.log("   - " + k));
        }

        if (extra.length) {
          console.log("   ⚠️ Extra:");
          extra.forEach(k => console.log("   + " + k));
        }
      }
    }
  }

  console.log("\n✔ DONE");
}

audit();
