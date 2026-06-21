// scripts/check-docs-sync.mjs
// Guards against documentation drift: fails if any PR shipped in recent git history is
// missing from CHANGELOG.md. It checks that EVERY referenced PR number in the last N
// commit subjects appears somewhere in the CHANGELOG — not merely that the highest one
// does (the old "max only" test let an intermediate PR slip whenever a later one was
// already present). Exits non-zero so the gap is caught before it compounds (the
// #507–#512 drift that motivated this check; the #629-gap-behind-#630 that motivated
// the gap-detection upgrade).
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
const changelogPrs = new Set(prNumbers(changelog));
const latestChangelogPr = max([...changelogPrs]);

// Check that EVERY shipped PR in recent history appears somewhere in the CHANGELOG — not
// just that the max is covered. The old "max only" test let an intermediate PR slip if a
// later one was already present (e.g. #629 went missing while #630 kept the check green).
const missing = [...new Set(commitPrs)].filter((n) => !changelogPrs.has(n)).sort((a, b) => a - b);

if (missing.length) {
  console.error(`\n❌ CHANGELOG out of sync.`);
  console.error(`   Shipped PR(s) missing from CHANGELOG.md: ${missing.map((n) => "#" + n).join(", ")}`);
  console.error(`   (Latest shipped #${latestCommitPr}; CHANGELOG references up to #${latestChangelogPr}.)`);
  console.error(`   Add an entry for each, then re-run \`npm run docs:check\`.`);
  console.error(`   (Chore/merge commits can opt out with [skip-changelog] in the subject.)\n`);
  process.exit(1);
}

console.log(`✅ docs in sync — all ${new Set(commitPrs).size} recent shipped PR(s) present in CHANGELOG (latest #${latestChangelogPr}).`);
