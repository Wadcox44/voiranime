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

/* =========================
   LOAD FILE
========================= */
function load(lang, file) {
  const filePath = path.join(__dirname, `locales/${lang}/${file}`);
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

/* =========================
   SAVE FILE
========================= */
function save(lang, file, data) {
  const filePath = path.join(__dirname, `locales/${lang}/${file}`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/* =========================
   SAFE MERGE (CORE FIX)
========================= */
function safeMerge(base, target) {
  const result = { ...target };

  for (const key of Object.keys(base)) {
    // 🔥 IMPORTANT : on ajoute UNIQUEMENT si absent
    if (!(key in result)) {
      result[key] = base[key]; // pas de overwrite
    }
  }

  return result;
}

/* =========================
   BACKUP (SAFETY)
========================= */
function backup(lang, file, data) {
  const backupDir = path.join(__dirname, "_backup_i18n");

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }

  const filePath = path.join(backupDir, `${lang}_${file}`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/* =========================
   RUN
========================= */
function run() {
  console.log("\n🚀 SAFE I18N SYNC v2 START\n");

  for (const file of FILES) {
    const baseData = load(BASE, file);

    console.log(`\n📄 File: ${file}`);

    for (const lang of LANGS) {
      let current = load(lang, file);

      // 💾 backup avant modification
      backup(lang, file, current);

      const before = Object.keys(current).length;

      if (lang === BASE) {
        // EN : on complète juste les trous éventuels
        current = safeMerge(baseData, current);
      } else {
        // autres langues : merge safe uniquement
        current = safeMerge(baseData, current);
      }

      save(lang, file, current);

      const after = Object.keys(current).length;

      console.log(`✔ ${lang}: ${before} → ${after}`);
    }
  }

  console.log("\n✔ SAFE SYNC v2 COMPLETE");
}

run();
