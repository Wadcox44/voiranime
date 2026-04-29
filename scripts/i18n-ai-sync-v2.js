import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const LOCALES_PATH = path.join(ROOT, "locales");

const LANGS = ["en", "fr", "es", "de"];
const EN = "en";

const REGEX = /t\(["'`]([\w.-]+)["'`]\)/g;

/* =========================
   1. SCAN CODE
========================= */
function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const keys = [];
  let match;

  while ((match = REGEX.exec(content)) !== null) {
    keys.push(match[1]);
  }

  return keys;
}

function scanFolder(dir) {
  let results = [];
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);

    if (file === "node_modules" || file === "locales" || file === "scripts") continue;

    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      results = results.concat(scanFolder(fullPath));
    } else if (file.endsWith(".js") || file.endsWith(".html")) {
      results = results.concat(scanFile(fullPath));
    }
  }

  return results;
}

/* =========================
   2. LOAD / SAVE
========================= */
function loadLocale(lang) {
  const folder = path.join(LOCALES_PATH, lang);
  const files = fs.readdirSync(folder);

  let data = {};
  for (const file of files) {
    const json = JSON.parse(fs.readFileSync(path.join(folder, file), "utf-8"));
    data = { ...data, ...json };
  }
  return data;
}

function saveLocale(lang, data) {
  const folder = path.join(LOCALES_PATH, lang);
  const files = fs.readdirSync(folder);

  const output = {};

  for (const file of files) {
    output[file] = {};
  }

  for (const key in data) {
    const file = files.find(f => f.includes("common")) || files[0];
    output[file][key] = data[key];
  }

  for (const file of files) {
    fs.writeFileSync(
      path.join(folder, file),
      JSON.stringify(output[file] || {}, null, 2)
    );
  }
}

/* =========================
   3. TRANSLATION (DeepL optional)
========================= */
async function translate(text, lang) {
  if (lang === EN) return text;

  const API_KEY = process.env.DEEPL_API_KEY;
  if (!API_KEY) return `[${lang}] ${text}`;

  try {
    const res = await fetch("https://api-free.deepl.com/v2/translate", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        auth_key: API_KEY,
        text,
        target_lang: lang.toUpperCase()
      })
    });

    const json = await res.json();
    return json.translations?.[0]?.text || text;
  } catch {
    return text;
  }
}

/* =========================
   4. CLEANUP ENGINE (NEW v2)
========================= */
function findUnusedKeys(usedKeys, enKeys) {
  return enKeys.filter(k => !usedKeys.includes(k));
}

/* =========================
   5. MAIN SYNC
========================= */
async function run() {
  console.log("\n🚀 i18n AI SYNC v2 START\n");

  const usedKeys = [...new Set(scanFolder(ROOT))];

  const en = loadLocale(EN);
  const enKeys = Object.keys(en);

  const missingInEN = usedKeys.filter(k => !en[k]);
  const unusedInEN = findUnusedKeys(usedKeys, enKeys);

  console.log(`📊 Used keys: ${usedKeys.length}`);
  console.log(`📊 EN keys: ${enKeys.length}`);
  console.log(`❌ Missing in EN: ${missingInEN.length}`);
  console.log(`⚠️ Unused in EN: ${unusedInEN.length}\n`);

  // ➜ ADD missing keys
  for (const key of missingInEN) {
    en[key] = key;
  }

  saveLocale(EN, en);

  // ➜ SYNC OTHER LANGS
  for (const lang of LANGS) {
    if (lang === EN) continue;

    console.log(`📄 Syncing ${lang}...`);

    const locale = loadLocale(lang);

    for (const key of Object.keys(en)) {
      if (!locale[key]) {
        locale[key] = await translate(en[key], lang);
      }
    }

    saveLocale(lang, locale);

    console.log(`✔ ${lang} synced`);
  }

  // 🧹 CLEAN REPORT (NO DELETION AUTO SAFE)
  fs.writeFileSync(
    path.join(ROOT, "i18n-report.json"),
    JSON.stringify(
      {
        missingInEN,
        unusedInEN,
        used: usedKeys.length,
        en: enKeys.length
      },
      null,
      2
    )
  );

  console.log("\n🧹 CLEAN REPORT SAVED → i18n-report.json");
  console.log("\n✔ AI SYNC v2 COMPLETE");
}

run();
