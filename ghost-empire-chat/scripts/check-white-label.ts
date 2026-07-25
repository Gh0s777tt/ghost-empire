// scripts/check-white-label.ts
// White-label guard for the BOT's viewer-facing copy: fails if a founder-specific literal
// ("Ghost Tokens", "GT", "Ghost Empire", the owner's handle/Discord) is baked into a string
// that can reach a tenant's Twitch/Kick/YouTube chat. Per-tenant naming must come from the
// portal at runtime — src/branding.ts (`getBranding()` / `applyBranding()`), never a literal.
//
// WHY AN AST AND NOT GREP: grep on this codebase is useless in both directions.
//  • False positives: the MAJORITY of raw "GT"/"Ghost Tokens" matches in src/ are comments and
//    file headers, which are legitimate (e.g. "// 1 GT per chatter per minute"). The TS parser
//    treats comments as trivia, so they are excluded for free — no comment-stripping heuristics.
//  • False negatives: the bot's viewer text is mostly a CALL ARGUMENT or a returned template
//    (`broadcast(`…`)`, `return `@${u} …``, `response: `…``), not a `field: "literal"`. A matcher
//    built for `field: "literal"` / JSX attributes — the shape web-side brand linting assumes —
//    silently reports zero on this package. Walking string/template literal NODES catches every
//    position a literal can occupy, whatever syntax wraps it.
//
// SCOPE / DELIBERATE EXCLUSIONS:
//  • `console.*` arguments — operator logs, never seen by a viewer. Excluding them keeps the
//    guard about chat copy instead of nagging about diagnostics.
//  • `src/**/__tests__/**` — a test must be able to write "GT" in order to assert its ABSENCE.
//  • Regex literals are not string literals, so `/%gt%/g` in branding.ts is not a finding.
//  • The `%gt%` placeholder is lowercase and the symbol pattern is case-SENSITIVE, so the
//    placeholder convention shared with the portal's i18n catalogs passes cleanly.
//
// Escape hatch: a trailing `// wl-ok: <reason>` on the offending line allows it, so a genuine
// exception (e.g. founder-only copy behind isFounderBrand) does not require editing this script.
//
// Run: `npm run lint:brand` (also wired into the CI job `lint:chat`).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// fileURLToPath, NOT URL.pathname — a checkout path containing a space (or any character the
// URL spec percent-encodes) would otherwise become "…/Moje%20Projekty/…" and fail to resolve.
const SRC = fileURLToPath(new URL("../src", import.meta.url));
const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Founder-specific naming that must never be hardcoded into viewer-facing copy. */
const PATTERNS: { re: RegExp; what: string }[] = [
  { re: /Ghost Tokens/i, what: "founder currency name" },
  // Case-SENSITIVE on purpose: the shared `%gt%` i18n placeholder is lowercase and legitimate.
  { re: /\bGT\b/, what: "founder currency symbol" },
  // Space-separated only — the package/log prefix "ghost-empire-chat" is not a brand leak.
  { re: /Ghost Empire/i, what: "founder brand name" },
  { re: /gh0s77tt/i, what: "founder owner handle" },
  { re: /discord\.gg\/deAPJ9Ym2F/i, what: "founder Discord invite" },
];

const LITERAL_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
]);

type Finding = { file: string; line: number; col: number; what: string; text: string };

/** Every .ts file under src/, minus test directories. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue; // tests assert on founder literals on purpose
      sourceFiles(full, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** `console.log/warn/error(...)` — operator diagnostics, not viewer-facing chat copy. */
function isConsoleCall(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  return ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "console";
}

let literalsChecked = 0;

function scan(file: string): Finding[] {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, /* setParentNodes */ true);
  const lines = text.split("\n");
  const findings: Finding[] = [];

  const visit = (node: ts.Node): void => {
    if (isConsoleCall(node)) return; // skip the whole subtree — diagnostics can say "GT"
    if (LITERAL_KINDS.has(node.kind)) {
      const value = (node as ts.LiteralLikeNode).text;
      literalsChecked++;
      const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      // Escape hatch: `// wl-ok: <reason>` on the same line.
      if (!/\/\/\s*wl-ok\b/.test(lines[line] ?? "")) {
        for (const { re, what } of PATTERNS) {
          if (re.test(value)) findings.push({ file, line: line + 1, col: character + 1, what, text: value });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return findings;
}

const files = sourceFiles(SRC);
const findings = files.flatMap(scan);

if (findings.length > 0) {
  console.error(`\n✖ white-label: ${findings.length} founder literal(s) in viewer-facing string(s):\n`);
  for (const f of findings) {
    const short = f.text.length > 80 ? `${f.text.slice(0, 77)}…` : f.text;
    console.error(`  ${relative(ROOT, f.file)}:${f.line}:${f.col}  ${f.what}`);
    console.error(`    ${JSON.stringify(short)}`);
  }
  console.error(
    `\n  Every portal's viewers read these strings, so per-tenant naming must come from the\n` +
      `  portal at runtime: await getBranding() (async paths) or applyBranding() with the\n` +
      `  %tokenName% / %gt% placeholders (sync paths) — see src/branding.ts.\n` +
      `  Casino copy (!duel/!heist/!slots) stakes the platform-wide free chips → say "żetony".\n` +
      `  Comments are already ignored; a genuine exception takes a trailing "// wl-ok: <reason>".\n`,
  );
  process.exit(1);
}

console.log(`✅ white-label OK — ${literalsChecked} string literals in ${files.length} bot source files, no founder-specific naming.`);
