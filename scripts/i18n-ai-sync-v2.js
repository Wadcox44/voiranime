import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const LOCALES_PATH = path.join(ROOT, "locales");

const LANGS = ["en", "fr", "es", "de"];
const EN = "en";

const EXTENSIONS = [".js", ".html", ".ts", ".tsx"];

/* =========================
   SCANNER V2 SHARED
========================= */
const PATTERNS = [
  /t\(["'`]([\w.-]+)["'`]\)/g,
  /data-i18n=["'`]([\w.-]+)["'`]/g,
  /dataset\.i18n\s*=\s*["'`]([\w.-]+)["'`]/g,
  /i18nKey\s*:\s*["'`]([\w.-]+)["'`]/g,
  /translations\[['"`]([\w.-]+)['"`]\]/g
];

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "locales",
  "scripts"
]);

/* =========================
   SCAN FILE
========================= */
function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const found = [];

  for (const regex of PATTERNS) {
    let match;

    while ((match = regex.exec(content)) !== null) {
      found.push(match[1]);
    }

    regex.lastIndex = 0;
  }

  return found;
}

/* =========================
   SCAN FOLDER
========================= */
function scanFolder(dir) {
  let found = [];

  const entries = fs.readdirSync(dir);

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (IGNORE_DIRS.has(entry)) continue;
      found.push(...scanFolder(fullPath));
      continue;
    }

    if (EXTENSIONS.some(ext => entry.endsWith(ext))) {
      found.push(...scanFile(fullPath));
    }
  }

  return found;
}

/* =========================
   LOAD / SAVE HELPERS
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

  for (const file of files) {
    const filePath = path.join(folder, file);
    const current = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    const updated = {};

    for (const key of Object.keys(current)) {
      updated[key] = data[key] ?? current[key];
    }

    for (const key of Object.keys(data)) {
      if (!(key in updated)) {
        updated[key] = data[key];
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
  }
}

/* =========================
   TRANSLATE
========================= */
async function translate(text, lang) {
  if (lang === EN) return text;

  const API_KEY = process.env.DEEPL_API_KEY;
  if (!API_KEY) return `[${lang}] ${text}`;

  try {
    const res = await fetch("https://api-free.deepl.com/v2/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
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
   MAIN
========================= */
async function run() {
  console.log("\n🚀 i18n AI SYNC v2 START\n");

  const usedKeys = [...new Set(scanFolder(ROOT))];

  const en = loadLocale(EN);
  const enKeys = Object.keys(en);

  const missingInEN = usedKeys.filter(k => !enKeys.includes(k));
  const unusedInEN = enKeys.filter(k => !usedKeys.includes(k));

  console.log(`📊 Used keys: ${usedKeys.length}`);
  console.log(`📊 EN keys: ${enKeys.length}`);
  console.log(`❌ Missing in EN: ${missingInEN.length}`);
  console.log(`⚠️ Unused in EN: ${unusedInEN.length}\n`);

  for (const key of missingInEN) {
    en[key] = key;
  }

  saveLocale(EN, en);

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

  fs.writeFileSync(
    path.join(ROOT, "i18n-report.json"),
    JSON.stringify(
      {
        usedKeys: usedKeys.length,
        enKeys: enKeys.length,
        missingInEN,
        unusedInEN
      },
      null,
      2
    )
  );

  console.log("\n✔ AI SYNC v2 COMPLETE");
}

run();
