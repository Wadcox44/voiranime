import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const EN_PATH = path.join(ROOT, "locales/en");

const EXTENSIONS = [".js", ".html", ".ts", ".tsx"];

/* =========================
   REGEX DETECTION PATTERNS
========================= */
const PATTERNS = [
  /t\(["'`]([\w.-]+)["'`]\)/g,                    // t("key")
  /data-i18n=["'`]([\w.-]+)["'`]/g,              // data-i18n="key"
  /dataset\.i18n\s*=\s*["'`]([\w.-]+)["'`]/g,    // el.dataset.i18n="key"
  /i18nKey\s*:\s*["'`]([\w.-]+)["'`]/g,          // { i18nKey: "key" }
  /translations\[['"`]([\w.-]+)['"`]\]/g         // translations["key"]
];

/* =========================
   IGNORE
========================= */
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "locales",
  "scripts"
]);

/* =========================
   LOAD EN KEYS
========================= */
function loadENKeys() {
  const files = fs.readdirSync(EN_PATH);
  let keys = [];

  for (const file of files) {
    const data = JSON.parse(
      fs.readFileSync(path.join(EN_PATH, file), "utf-8")
    );

    keys.push(...Object.keys(data));
  }

  return [...new Set(keys)];
}

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
   RUN
========================= */
function run() {
  console.log("\n🔎 I18N COVERAGE SCANNER V2 START\n");

  const usedKeys = [...new Set(scanFolder(ROOT))];
  const enKeys = loadENKeys();

  const missingInEN = usedKeys.filter(k => !enKeys.includes(k));
  const unusedInEN = enKeys.filter(k => !usedKeys.includes(k));

  const report = {
    stats: {
      usedKeys: usedKeys.length,
      enKeys: enKeys.length,
      missingInEN: missingInEN.length,
      unusedInEN: unusedInEN.length
    },
    missingInEN,
    unusedInEN
  };

  fs.writeFileSync(
    path.join(ROOT, "i18n-coverage-v2-report.json"),
    JSON.stringify(report, null, 2)
  );

  console.log("📊 Stats:");
  console.log(report.stats);

  console.log("\n✔ Report saved → i18n-coverage-v2-report.json");
}

run();
