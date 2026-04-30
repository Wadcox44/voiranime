import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const LOCALES_PATH = path.join(ROOT, "locales", "en");

const REPORT_PATH = path.join(ROOT, "i18n-clean-report.json");

// mots/segments considérés "core" = probablement à garder
const CORE_PATTERNS = [
  "nav.",
  "footer.",
  "anime.",
  "profile.",
  "watch.",
  "search.",
  "section.",
  "common."
];

// mots indiquant souvent du legacy/test
const LEGACY_HINTS = [
  "old",
  "legacy",
  "test",
  "tmp",
  "debug",
  "beta"
];

/* =========================
   LOAD EN KEYS
========================= */
function loadEN() {
  const files = fs.readdirSync(LOCALES_PATH);

  let keys = [];

  for (const file of files) {
    const data = JSON.parse(
      fs.readFileSync(path.join(LOCALES_PATH, file), "utf-8")
    );

    keys.push(...Object.keys(data));
  }

  return keys;
}

/* =========================
   LOAD UNUSED FROM REPORT
========================= */
function loadUnused() {
  const report = JSON.parse(
    fs.readFileSync(path.join(ROOT, "i18n-report.json"), "utf-8")
  );

  return report.unusedInEN || [];
}

/* =========================
   SCORE ENGINE
========================= */
function classifyKey(key) {
  let confidence = 50;
  let reason = [];

  if (CORE_PATTERNS.some(p => key.startsWith(p))) {
    confidence -= 35;
    reason.push("core_namespace");
  }

  if (LEGACY_HINTS.some(h => key.includes(h))) {
    confidence += 35;
    reason.push("legacy_hint");
  }

  if (key.split(".").length <= 1) {
    confidence += 20;
    reason.push("flat_key_suspicious");
  }

  confidence = Math.max(0, Math.min(100, confidence));

  let category = "review";

  if (confidence >= 75) category = "likely_unused";
  else if (confidence <= 25) category = "likely_active_hidden";

  return {
    key,
    confidence,
    category,
    reason
  };
}

/* =========================
   RUN
========================= */
function run() {
  console.log("\n🧹 I18N AI CLEANER v1 START\n");

  const enKeys = loadEN();
  const unusedKeys = loadUnused();

  const analysis = unusedKeys.map(classifyKey);

  const summary = {
    totalENKeys: enKeys.length,
    unusedDetected: unusedKeys.length,
    likelyUnused: analysis.filter(a => a.category === "likely_unused").length,
    review: analysis.filter(a => a.category === "review").length,
    likelyActiveHidden: analysis.filter(a => a.category === "likely_active_hidden").length
  };

  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        summary,
        analysis
      },
      null,
      2
    )
  );

  console.log("📊 Summary:");
  console.log(summary);

  console.log(`\n✔ Report saved → ${REPORT_PATH}`);
}

run();
