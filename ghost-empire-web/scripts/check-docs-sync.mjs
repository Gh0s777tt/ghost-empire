// scripts/check-docs-sync.mjs
// Guards against documentation drift: fails if the CHANGELOG has fallen behind the
// code. It compares the highest PR number referenced in recent git history with the
// highest PR number referenced in CHANGELOG.md — if a PR shipped but isn't in the
// CHANGELOG, this exits non-zero so the gap is caught before it compounds (exactly
// the #507–#512 drift that motivated this check).
//
//   npm run docs:check     (run as part of the standard local gates + in CI)
//
// Escape hatch: a commit subject containing [skip-changelog] is ignored (chores,
// reverts, merge commits). Docs-only PRs still get a CHANGELOG line by convention.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const prNumbers = (text) => [...text.matchAll(/#(\d{2,})/g)].map((m) => Number(m[1]));
const max = (nums) => (nums.length ? Math.max(...nums) : 0);

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const changelogPath = join(root, "CHANGELOG.md");

let logRaw = "";
try {
  // Last 60 commit subjects; skip those that opt out of the changelog requirement.
  logRaw = execSync("git log -60 --format=%s", { cwd: root, encoding: "utf8" });
} catch (e) {
  console.warn("⚠️  docs:check — git log unavailable, skipping (", e.message, ")");
  process.exit(0); // never block when there's no git history (e.g. shallow CI clone of a tarball)
}

const commitPrs = logRaw
  .split("\n")
  .filter((s) => s && !/\[skip-changelog\]/i.test(s))
  .flatMap(prNumbers);
const latestCommitPr = max(commitPrs);

const changelog = readFileSync(changelogPath, "utf8");
const latestChangelogPr = max(prNumbers(changelog));

if (latestCommitPr > latestChangelogPr) {
  const missing = [...new Set(commitPrs)].filter((n) => n > latestChangelogPr).sort((a, b) => a - b);
  console.error(`\n❌ CHANGELOG out of sync.`);
  console.error(`   Latest shipped PR: #${latestCommitPr} — CHANGELOG only references up to #${latestChangelogPr}.`);
  console.error(`   Missing from CHANGELOG.md [Unreleased]: ${missing.map((n) => "#" + n).join(", ")}`);
  console.error(`   Add an entry for each, then re-run \`npm run docs:check\`.`);
  console.error(`   (Chore/merge commits can opt out with [skip-changelog] in the subject.)\n`);
  process.exit(1);
}

console.log(`✅ docs in sync — CHANGELOG references #${latestChangelogPr} ≥ latest shipped #${latestCommitPr}`);
