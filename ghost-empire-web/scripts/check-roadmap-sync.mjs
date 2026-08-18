#!/usr/bin/env node
// scripts/check-roadmap-sync.mjs — guards CLAUDE.md documentation checklist item 2 (ROADMAP.md).
//
// WHY THIS EXISTS: `docs:check` only proves that a shipped PR got a CHANGELOG line. Nothing
// machine-checked the ROADMAP, so the "🆕 Świeżo dowiezione" freshness notes were free to rot
// while `[Unreleased]` kept growing — and they did: the notes stopped at 2026-07-04 and three
// weeks of shipped work (payments-audit batches 1–9, the GitLab CI migration, the i18n closure,
// #801) left no roadmap trace at all. The drift is invisible precisely because nothing fails:
// a stale roadmap builds, lints and deploys exactly like a fresh one.
//
// THE INVARIANT: if work is shipping, the roadmap's newest freshness note must be keeping up.
// We compare the newest note date against the newest SHIPPED commit, where "shipped" mirrors
// the convention `docs:check` already uses — non-merge commits that did not opt out with
// [skip-changelog]. A quiet repo stays green (both dates move together, so the delta stays
// small); only *unrecorded* work trips the gate.
//
// HARD FAIL: newest shipped commit is more than MAX_DRIFT_DAYS newer than the newest note.
// SKIPPED:   no git history (shallow CI clone / tarball) — same graceful exit as docs:check.
//
// Usage: node scripts/check-roadmap-sync.mjs        (part of the standard local + CI gates)
//        ROADMAP_MAX_DRIFT_DAYS=30 npm run docs:roadmap    (loosen for a deliberate quiet spell)
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Generous by design: the historical cadence is a note every few days, so two weeks of silence
// while commits land is already a real signal — but it never fires on a normal week of work.
const MAX_DRIFT_DAYS = Number(process.env.ROADMAP_MAX_DRIFT_DAYS ?? 14);

const DAY_MS = 86_400_000;
const daysBetween = (a, b) => Math.round((b - a) / DAY_MS);
const parseDay = (s) => Date.parse(`${s}T00:00:00Z`);

// ── 1) newest freshness note in ROADMAP.md ────────────────────────────────────
const roadmap = readFileSync(join(root, "ROADMAP.md"), "utf8");
const noteDates = [...roadmap.matchAll(/Świeżo dowiezione \((\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);

if (!noteDates.length) {
  console.error("\n❌ ROADMAP.md has no '🆕 Świeżo dowiezione (YYYY-MM-DD…)' note at all.");
  console.error("   That block is how shipped work stays visible on the roadmap — add one.\n");
  process.exit(1);
}

const newestNote = noteDates.reduce((a, b) => (parseDay(a) >= parseDay(b) ? a : b));

// ── 2) newest SHIPPED commit (same convention as docs:check) ──────────────────
let logRaw = "";
try {
  // %cs = committer date, YYYY-MM-DD. --no-merges: the feature commit is the ship event,
  // and merge subjects would otherwise re-date work that is already recorded.
  logRaw = execSync("git log -80 --no-merges --format=%cs%x09%s", { cwd: root, encoding: "utf8" });
} catch (e) {
  console.warn("⚠️  docs:roadmap — git log unavailable, skipping (", e.message, ")");
  process.exit(0); // never block without history (shallow CI clone of a tarball)
}

const shipped = logRaw
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [date, ...rest] = line.split("\t");
    return { date, subject: rest.join("\t") };
  })
  .filter((c) => !/\[skip-changelog\]/i.test(c.subject));

if (!shipped.length) {
  console.log("✅ docs:roadmap — no shipped commits in recent history, nothing to reconcile.");
  process.exit(0);
}

const newestShip = shipped.reduce((a, b) => (parseDay(a.date) >= parseDay(b.date) ? a : b));
const drift = daysBetween(parseDay(newestNote), parseDay(newestShip.date));

// ── 3) verdict ────────────────────────────────────────────────────────────────
// Context line, always printed: the numbers a human needs to judge the call themselves.
// "unrecorded" is the one that matters — shipped commits landed AFTER the newest note, i.e.
// work the roadmap does not describe yet. (Same-day commits count as recorded; a note written
// on the day of a push is the good case, not drift.)
const unrecorded = shipped.filter((c) => parseDay(c.date) > parseDay(newestNote)).length;
console.log(
  `roadmap: newest note ${newestNote} · newest shipped commit ${newestShip.date} · ` +
    `drift ${drift} d (limit ${MAX_DRIFT_DAYS}) · ${unrecorded} shipped commit(s) after the note`,
);

if (drift > MAX_DRIFT_DAYS) {
  console.error(`\n❌ ROADMAP.md is stale — ${drift} days of shipped work with no freshness note.`);
  console.error(`   Newest '🆕 Świeżo dowiezione' note: ${newestNote}`);
  console.error(`   Newest shipped commit:              ${newestShip.date}  ${newestShip.subject}`);
  console.error(`   CLAUDE.md checklist item 2: reconcile ROADMAP.md against CHANGELOG's`);
  console.error(`   [Unreleased] section — add a dated note (and flip any 🟡 row that shipped),`);
  console.error(`   then re-run \`npm run docs:roadmap\`.\n`);
  process.exit(1);
}

console.log(`✅ roadmap in sync — freshness note is ${drift} day(s) behind the newest shipped commit.`);
