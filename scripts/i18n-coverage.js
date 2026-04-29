import fs from "fs";
import path from "path";

const __dirname = path.resolve();

const EN_PATH = path.join(__dirname, "locales/en");

// ❌ ignore old*, legacy*, etc.
const IGNORE_PATTERNS = ["old"];

/* =========================
   REGEX I18N (FIXED)
   support: t("key") / i18n.t("key") / I18N.t("key")
========================= */
const REGEX = /(?:t|i18n\.t|I18N\.t)\(["'`]([\w.-]+)["'`]\)/g;

/* =========================
   VALIDATION DES KEYS
========================= */
function isValidKey(key) {
  return (
    typeof key === "string" &&
    key.includes(".") &&                 // important: nav.home, anime.title etc.
    /^[a-zA-Z0-9._-]+$/.test(key) &&     // caractères valides uniquement
    key.length > 2
  );
}

/* =========================
   IGNORE FILTER
========================= */
function isIgnored(name) {
  return IGNORE_PATTERNS.some(p =>
    name.startsWith(p + "/") ||
    name.includes("/" + p) ||
    name.startsWith(p + "_") ||
    name.startsWith(p + "-") ||
    name === p
  );
}

/* =========================
   SCAN FILE
========================= */
function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const keys = [];

  let match;
  while ((match = REGEX.exec(content)) !== null) {
    const key = match[1];

    if (isValidKey(key)) {
      keys.push(key);
    }
  }

  return keys;
}

/* =========================
   SCAN FOLDER
========================= */
function scanFolder(folder) {
  let results = [];

  const files = fs.readdirSync(folder);

  for (const file of files) {
    const fullPath = path.join(folder, file);

    if (isIgnored(file)) {
      console.log(`⏭ Ignored: ${file}`);
      continue;
    }

    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      results = results.concat(scanFolder(fullPath));
    } 
    else if (file.endsWith(".js") || file.endsWith(".html")) {
      results = results.concat(scanFile(fullPath));
    }
  }

  return results;
}

/* =========================
   LOAD EN KEYS
========================= */
function loadEN() {
  const files = fs.readdirSync(EN_PATH);

  let en = {};

  for (const file of files) {
    const data = JSON.parse(
      fs.readFileSync(path.join(EN_PATH, file), "utf-8")
    );
    en = { ...en, ...data };
  }

  return Object.keys(en);
}

/* =========================
   RUN
========================= */
function run() {
  console.log("\n🔎 i18n COVERAGE SCANNER (FIXED)\n");

  const usedKeys = scanFolder("./");
  const enKeys = loadEN();

  const usedSet = new Set(usedKeys);
  const enSet = new Set(enKeys);

  const missingInEN = [...usedSet].filter(k => !enSet.has(k));
  const unusedInEN = [...enSet].filter(k => !usedSet.has(k));

  console.log("📊 STATS");
  console.log("Used keys:", usedSet.size);
  console.log("EN keys:", enSet.size);

  console.log("\n❌ Missing in EN (CRITICAL)");
  missingInEN.forEach(k => console.log(" - " + k));

  console.log("\n⚠️ Unused in EN");
  unusedInEN.forEach(k => console.log(" - " + k));

  fs.writeFileSync(
    path.join(__dirname, "i18n-coverage-report.json"),
    JSON.stringify({ missingInEN, unusedInEN }, null, 2)
  );

  console.log("\n✔ Report saved: i18n-coverage-report.json");
}

run();
