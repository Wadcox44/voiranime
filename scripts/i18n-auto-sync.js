import fs from "fs";
import path from "path";

const __dirname = path.resolve();

const LANGS = ["en", "fr", "es", "de"];
const BASE = "en";

const FILES = [
  "common.json",
  "navigation.json",
  "anime.json",
  "user.json"
];

function load(lang, file) {
  const filePath = path.join(__dirname, `locales/${lang}/${file}`);
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function save(lang, file, data) {
  const filePath = path.join(__dirname, `locales/${lang}/${file}`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function merge(base, target) {
  const result = { ...target };

  for (const key of Object.keys(base)) {
    if (!(key in result)) {
      result[key] = base[key] || `TODO_${key}`;
    }
  }

  return result;
}

function run() {
  console.log("\n🚀 i18n AUTO SYNC START\n");

  for (const file of FILES) {
    const baseData = load(BASE, file);

    console.log(`\n📄 Processing ${file}`);

    for (const lang of LANGS) {
      let data = load(lang, file);

      if (lang === "en") {
        // EN = source of truth → on complète juste si besoin
        data = merge(baseData, data);
      } else {
        // autres langues → sync structure EN
        data = merge(baseData, data);
      }

      save(lang, file, data);

      console.log(`✔ ${lang} synced`);
    }
  }

  console.log("\n✔ AUTO SYNC COMPLETE");
}

run();
