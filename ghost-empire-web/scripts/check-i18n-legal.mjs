#!/usr/bin/env node
// scripts/check-i18n-legal.mjs — guards the mandatory "legal copy must never drift" rule.
//
// WHY THIS EXISTS: next-intl deep-merges every locale over EN (src/i18n/request.ts), so a MISSING
// key silently renders English instead of failing. That makes legal drift invisible and unbounded —
// and it means the old CLAUDE.md claim "a missing key breaks the build" was simply false. The
// privacy policy and terms are the one place where silently serving another language is not a
// cosmetic bug: it includes the Google API Limited-Use disclosure Google REQUIRES to be shown, plus
// GDPR data-collection / processor / encryption clauses.
//
// HARD FAIL: any key under a LEGAL namespace present in the reference locale but missing elsewhere.
// ADVISORY: overall per-locale coverage, printed so the wider (non-legal) backlog stays visible.
//
// Usage: node scripts/check-i18n-legal.mjs [--all]   (--all also fails on NON-legal drift)
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "src/messages";
const REFERENCE = "en";
/** Namespaces whose drift is a compliance problem, not a cosmetic one. */
const LEGAL_NAMESPACES = ["privacy", "terms"];
const strict = process.argv.includes("--all");

/** Flatten to dotted leaf paths (arrays are treated as leaves — they are message lists). */
function leaves(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v) ? leaves(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}
const isLegal = (key) => LEGAL_NAMESPACES.some((ns) => key.startsWith(`${ns}.`));

const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
const read = (f) => JSON.parse(readFileSync(join(DIR, f), "utf8"));

const refKeys = leaves(read(`${REFERENCE}.json`));
const refLegal = refKeys.filter(isLegal);
const refSet = new Set(refKeys);

let legalFailures = 0;
let otherFailures = 0;
const rows = [];

for (const file of files) {
  const locale = file.replace(/\.json$/, "");
  if (locale === REFERENCE) continue;
  const keys = new Set(leaves(read(file)));

  const missingLegal = refLegal.filter((k) => !keys.has(k));
  const missingAll = refKeys.filter((k) => !keys.has(k));
  // Keys the locale has that the reference doesn't — usually stale leftovers.
  const orphans = [...keys].filter((k) => !refSet.has(k));

  rows.push({ locale, missingLegal: missingLegal.length, missingAll: missingAll.length, orphans: orphans.length });

  if (missingLegal.length) {
    legalFailures += missingLegal.length;
    console.error(`\n❌ ${locale}: ${missingLegal.length} LEGAL key(s) missing — these render in English:`);
    for (const k of missingLegal) console.error(`   · ${k}`);
  }
  if (strict) otherFailures += missingAll.length - missingLegal.length;
}

console.log("\nlocale | legal missing | total missing | orphan keys");
console.log("-------+---------------+---------------+------------");
for (const r of rows) {
  const flag = r.missingLegal ? "❌" : "✅";
  console.log(
    `${flag} ${r.locale.padEnd(4)} | ${String(r.missingLegal).padStart(13)} | ${String(r.missingAll).padStart(13)} | ${String(r.orphans).padStart(11)}`,
  );
}

if (legalFailures || (strict && otherFailures)) {
  console.error(
    `\n❌ i18n legal parity FAILED — ${legalFailures} missing legal key(s)` +
      (strict ? ` + ${otherFailures} other missing key(s)` : "") +
      `.\n   Legal copy (privacy/terms) MUST exist in every locale — see CLAUDE.md.`,
  );
  process.exit(1);
}

console.log(
  `\n✅ i18n legal parity OK — all ${refLegal.length} legal keys present in ${rows.length} locale(s).` +
    (rows.some((r) => r.missingAll) ? "\n   (non-legal keys still fall back to EN — tracked, not gated)" : ""),
);
