// scripts/check-env-docs.mjs
// Strażnik dryfu dokumentacji ENV: KAŻDA `process.env.X` używana w kodzie musi być
// udokumentowana w docs/ENV.md (jako `X` w backtickach) — inaczej nowa zmienna trafia
// na produkcję bez opisu „co i po co". Rodzina zmiennych opisana wzorcem (np.
// STRIPE_PRICE_<PLAN>_<N>M) jest uznawana za udokumentowaną przez prefiks.
// Built-iny platformy (NODE_ENV/VERCEL_*/NEXT_RUNTIME…) są ignorowane.
//
//   npm run docs:env   (część lokalnych bramek; docs muszą być w sync przed PR)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(webRoot, "src");
const envDocPath = join(webRoot, "..", "docs", "ENV.md");

// Built-iny frameworka/platformy — odczytywane, ale NIE ustawiane ręcznie i nie
// wymagające wpisu w ENV.md (część już opisana zbiorczo).
const IGNORE = new Set([
  "NODE_ENV",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "NEXT_RUNTIME",
  "NEXT_PUBLIC_VERCEL_ENV",
  "CI",
]);

// Rodziny udokumentowane WZORCEM w ENV.md (dokładna nazwa nie jest backtickowana).
const PATTERN_PREFIXES = ["STRIPE_PRICE_"];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}

const used = new Set();
for (const file of walk(srcDir)) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/process\.env\.([A-Z0-9_]+)/g)) used.add(m[1]);
}

const envDoc = readFileSync(envDocPath, "utf8");
const documented = new Set([...envDoc.matchAll(/`([A-Z0-9_]{3,})`/g)].map((m) => m[1]));

const isDocumented = (v) =>
  documented.has(v) || IGNORE.has(v) || PATTERN_PREFIXES.some((p) => v.startsWith(p));

const missing = [...used].filter((v) => !isDocumented(v)).sort();

if (missing.length) {
  console.error(`\n❌ ENV.md out of sync.`);
  console.error(`   Zmienne process.env użyte w kodzie, brak w docs/ENV.md: ${missing.join(", ")}`);
  console.error(`   Dopisz je do docs/ENV.md (sekcja właściwa) albo dodaj do IGNORE/PATTERN, jeśli to built-in/wzorzec.\n`);
  process.exit(1);
}

console.log(`✅ ENV w sync — wszystkie ${used.size} zmienne process.env obecne w docs/ENV.md (lub ujęte wzorcem/built-inem).`);
