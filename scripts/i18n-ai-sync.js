import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const LOCALES_PATH = path.join(ROOT, "locales");
const SRC_PATH = path.join(ROOT);

const LANGS = ["en", "fr", "es", "de"];
const EN = "en";

// 🔍 détecte t("key")
const REGEX = /t\(["'`]([\w.-]+)["'`]\)/g;

/* =========================
   1. SCAN CODE KEYS
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

    // ignore node_modules + locales
    if (file === "node_modules" || file === "locales") continue;

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
   2. LOAD LOCALES
========================= */
function loadLocale(lang) {
  const folder = path.join(LOCALES_PATH, lang);
  const files = fs.readdirSync(folder);

  let data = {};

  for (const file of files) {
    const json = JSON.parse(
      fs.readFileSync(path.join(folder, file), "utf-8")
    );
    data = { ...data, ...json };
  }

  return data;
}

function saveLocale(lang, data) {
  const folder = path.join(LOCALES_PATH, lang);
  const files = fs.readdirSync(folder);

  const perFile = {};

  // repartir par fichier existant (simple split logique)
  for (const file of files) {
    perFile[file] = {};
  }

  for (const key in data) {
    const targetFile = files.find(f => f.includes("common")) || files[0];
    perFile[targetFile][key] = data[key];
  }

  for (const file of files) {
    fs.writeFileSync(
      path.join(folder, file),
      JSON.stringify(perFile[file] || {}, null, 2)
    );
  }
}

/* =========================
   3. TRANSLATION ENGINE
========================= */

// 👉 fallback simple (tu pourras brancher DeepL après)
async function translate(text, targetLang) {
  if (targetLang === EN) return text;

  const API_KEY = process.env.DEEPL_API_KEY;

  if (!API_KEY) {
    return `[${targetLang.toUpperCase()}] ${text}`;
  }

  try {
    const res = await fetch("https://api-free.deepl.com/v2/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        auth_key: API_KEY,
        text,
        target_lang: targetLang.toUpperCase()
      })
    });

    const json = await res.json();
    return json.translations?.[0]?.text || text;
  } catch (e) {
    return text;
  }
}

/* =========================
   4. SYNC ENGINE
========================= */
async function sync() {
  console.log("\n🚀 i18n AI SYNC v1 START\n");

  const usedKeys = [...new Set(scanFolder(SRC_PATH))];
  const enData = loadLocale(EN);

  const missingKeys = usedKeys.filter(k => !enData[k]);

  console.log(`📊 Used keys: ${usedKeys.length}`);
  console.log(`📊 EN keys: ${Object.keys(enData).length}`);
  console.log(`❌ Missing in EN: ${missingKeys.length}\n`);

  // 1. add missing to EN
  for (const key of missingKeys) {
    enData[key] = key;
  }

  // save EN
  saveLocale(EN, enData);

  // 2. sync other languages
  for (const lang of LANGS) {
    if (lang === EN) continue;

    console.log(`📄 Syncing ${lang}...`);

    const localeData = loadLocale(lang);

    for (const key of Object.keys(enData)) {
      if (!localeData[key]) {
        const translated = await translate(enData[key], lang);
        localeData[key] = translated;
      }
    }

    saveLocale(lang, localeData);

    console.log(`✔ ${lang} synced`);
  }

  console.log("\n✔ AI SYNC COMPLETE");
}

/* ========================= */
sync();
