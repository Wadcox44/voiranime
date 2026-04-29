import fs from "fs";
import path from "path";

const __dirname = path.resolve();

const EN_PATH = path.join(__dirname, "locales/en");
const SRC_FOLDERS = ["./"];

// ❌ fichiers / dossiers à ignorer (old*, legacy*, etc.)
const IGNORE_PATTERNS = ["old"];

const REGEX = /t\(["'`]([\w.-]+)["'`]\)/g;

/* =========================
   UTIL : ignore filter
========================= */
function isIgnored(name) {
  return IGNORE_PATTERNS.some(p =>
    name.startsWith(p + "/") ||   // dossier old/
    name.includes("/" + p) ||     // sous-dossier
    name.startsWith(p + "_") ||   // old_file.js
    name.startsWith(p + "-") ||   // old-file.js
    name === p                    // exact match
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
    keys.push(match[1]);
  }

  return keys;
}

/* =========================
   SCAN FOLDER (FILTERED)
========================= */
function scanFolder(folder) {
  let results = [];

  const files = fs.readdirSync(folder);

  for (const file of files) {
    const fullPath = path.join(folder, file);

    // 🔥 ignore old*
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
   RUN AUDIT
========================= */
function run() {
  console.log("\n🔎 i18n COVERAGE SCANNER\n");

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
