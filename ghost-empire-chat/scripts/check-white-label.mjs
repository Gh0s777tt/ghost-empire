// scripts/check-white-label.mjs
// Strażnik white-label dla WIDOCZNEGO DLA WIDZA tekstu bota.
//
// PO CO: bot pisze na czacie KAŻDEGO portalu, więc wpisana na sztywno waluta
// portalu-założyciela ("Ghost Tokens"/"GT") wycieka markę foundera do czatu
// sub-portalu — dokładnie ten wyciek, którego CLAUDE.md zakazuje w aplikacji web.
// Poprawnie jest przez tokenName()/tokenSymbol() z src/branding.ts.
//
// DLACZEGO WŁASNY SKANER, A NIE ZWYKŁY GREP: surowy grep po `\bGT\b` w src/ to w
// większości trafienia w KOMENTARZACH ("all GT math lives server-side") — szum,
// który zabija bramkę. Skaner tokenizuje plik i patrzy WYŁĄCZNIE na literały
// stringów ('...', "...", `...` wraz z fragmentami między ${...}), więc:
//   • komentarze i kod (identyfikatory typu handleGtGame) są pomijane,
//   • tekst przekazany jako ARGUMENT WYWOŁANIA — broadcast(`... GT ...`) — jest
//     widziany tak samo jak `field: "..."`; to właśnie w tej formie żyje
//     większość tekstu bota, więc matcher po samych przypisaniach nic by nie znalazł.
//
// Pomijamy literały w wywołaniach console.* — stdout leci do operatora, nie do
// widza (np. console.log("[ghost-empire-chat] starting…") to nie wyciek).
// Awaryjny wyłącznik dla pojedynczej linii: dopisz w niej `white-label-ok`.
//
//   npm run lint:brand    (bramka lokalna; w CI wisi w jobie lint:chat)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const botRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
// Tylko src/: scripts/ to narzędzia operatora (flow autoryzacji), nie tekst na czacie.
const srcDir = join(botRoot, "src");

// Marka/waluta foundera. Wszystko to musi iść przez branding.ts, nie literałem.
export const PATTERNS = [
  { re: /\bGT\b/, what: "symbol waluty foundera „GT”", fix: "tokenSymbol() (po kwocie) lub tokenName()" },
  { re: /ghost\s*tokens?/i, what: "nazwa waluty foundera „Ghost Tokens”", fix: "tokenName()" },
  { re: /ghost[\s_-]*empire/i, what: "marka foundera „Ghost Empire”", fix: "branding portalu / env.portalUrl" },
  { re: /gh0s7*tt/i, what: "handle foundera", fix: "branding portalu" },
  { re: /discord\.gg\//i, what: "zaproszenie na Discord foundera", fix: "socialLinks tenanta" },
];

const SKIP_LINE = [
  /console\s*\.\s*(log|warn|error|info|debug)\s*\(/, // stdout operatora, nie czat
  /white-label-ok/, // jawny wyłącznik dla świadomego wyjątku
];

/**
 * Wyciąga literały stringów z pliku TS/JS.
 *
 * Mini-tokenizer (nie pełny parser): idzie znak po znaku i śledzi kontekst —
 * kod / komentarz liniowy / komentarz blokowy / '…' / "…" / `…` z zagnieżdżonym
 * ${ … } (tam kontekst wraca do kodu, więc `${env.portalUrl}` NIE jest tekstem).
 * Literały regexowe są rozpoznawane i pomijane, inaczej `/["']/` otworzyłby
 * fałszywy string i połknął resztę pliku.
 *
 * Fragmenty template-literala rozbite przez ${…} zwracamy OSOBNO — brand w
 * `Pula: ${n} GT.` siedzi w kawałku " GT." i tak też jest wykrywany.
 *
 * @param {string} src zawartość pliku
 * @returns {{line: number, text: string}[]} literały z numerami linii (1-indexed)
 */
export function extractLiterals(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  let line = 1;
  let chunk = "";
  let chunkLine = 1;
  // Stos kontekstów: { kind: "code" | "tpl" }. "code" liczy głębokość klamer, by
  // odróżnić `}` zamykające blok od tego, które kończy ${ … } w templatce.
  const stack = [{ kind: "code", brace: 0 }];
  // Ostatni znaczący znak kodu — decyduje, czy `/` zaczyna regex, czy jest dzieleniem.
  let lastCode = "";

  const flush = () => {
    if (chunk) out.push({ line: chunkLine, text: chunk });
    chunk = "";
  };

  while (i < n) {
    const cur = stack[stack.length - 1];
    const c = src[i];
    const c2 = src[i + 1];

    if (cur.kind === "tpl") {
      if (c === "\\") {
        chunk += c2 ?? "";
        if (c2 === "\n") line++;
        i += 2;
        continue;
      }
      if (c === "`") {
        flush();
        stack.pop();
        lastCode = "`";
        i++;
        continue;
      }
      if (c === "$" && c2 === "{") {
        flush();
        stack.push({ kind: "code", brace: 0 });
        lastCode = "{";
        i += 2;
        continue;
      }
      if (c === "\n") {
        flush();
        line++;
        chunkLine = line;
        i++;
        continue;
      }
      if (!chunk) chunkLine = line;
      chunk += c;
      i++;
      continue;
    }

    // ── kontekst kodu ──────────────────────────────────────────────────────
    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "/" && c2 === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && c2 === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }
    // Regex literal: `/` tam, gdzie spodziewana jest WARTOŚĆ (a nie operator dzielenia).
    if (c === "/" && (lastCode === "" || "(,=:[!&|?{};+-*%~^<>".includes(lastCode))) {
      i++;
      let inClass = false;
      while (i < n) {
        const r = src[i];
        if (r === "\\") {
          i += 2;
          continue;
        }
        if (r === "[") inClass = true;
        else if (r === "]") inClass = false;
        else if (r === "/" && !inClass) {
          i++;
          break;
        } else if (r === "\n") {
          line++;
          break; // niedomknięty regex — nie zawieszaj się
        }
        i++;
      }
      while (i < n && /[a-z]/.test(src[i])) i++; // flagi
      lastCode = "/";
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      chunkLine = line;
      chunk = "";
      i++;
      while (i < n && src[i] !== q) {
        if (src[i] === "\\") {
          chunk += src[i + 1] ?? "";
          i += 2;
          continue;
        }
        if (src[i] === "\n") line++; // formalnie niepoprawne w JS, ale nie gubimy synchronizacji
        chunk += src[i];
        i++;
      }
      i++;
      flush();
      lastCode = q;
      continue;
    }
    if (c === "`") {
      stack.push({ kind: "tpl" });
      chunk = "";
      chunkLine = line;
      i++;
      continue;
    }
    if (c === "{") {
      cur.brace++;
      lastCode = c;
      i++;
      continue;
    }
    if (c === "}") {
      if (cur.brace === 0 && stack.length > 1) {
        stack.pop(); // koniec ${ … } → wracamy do templatki
        chunk = "";
        chunkLine = line;
        i++;
        continue;
      }
      cur.brace--;
      lastCode = c;
      i++;
      continue;
    }
    lastCode = c;
    i++;
  }
  return out;
}

// Testy są pomijane: nic z nich nie trafia na czat, a fixture'y bramki MUSZĄ
// zawierać prawdziwe wycieki („Ghost Tokens”, „GT”), żeby dowodzić, że matcher
// je łapie. Skanowanie ich zamieniłoby własny test bramki w jej porażkę.
const SKIP_PATH = /(^|[/\\])__tests__([/\\]|$)|\.test\.[cm]?[tj]s$/;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP_PATH.test(p)) continue;
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|mts|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * Skanuje zawartość JEDNEGO pliku i zwraca wycieki.
 *
 * @param {string} text zawartość pliku
 * @param {string} [file] nazwa do raportu
 * @returns {{file: string, line: number, what: string, fix: string, text: string}[]}
 */
export function scanText(text, file = "<input>") {
  const lines = text.split("\n");
  const findings = [];
  for (const lit of extractLiterals(text)) {
    const rawLine = lines[lit.line - 1] ?? "";
    if (SKIP_LINE.some((re) => re.test(rawLine))) continue;
    for (const p of PATTERNS) {
      if (p.re.test(lit.text)) {
        findings.push({ file, line: lit.line, what: p.what, fix: p.fix, text: lit.text.trim().slice(0, 80) });
        break; // jedno trafienie na literał wystarczy
      }
    }
  }
  return findings;
}

function main() {
  const findings = [];
  let files = 0;
  let literals = 0;

  for (const file of walk(srcDir)) {
    const text = readFileSync(file, "utf8");
    files++;
    literals += extractLiterals(text).length;
    findings.push(...scanText(text, relative(botRoot, file)));
  }

  if (findings.length) {
    console.error(`\n❌ Wyciek white-label w tekście bota widocznym dla widza (${findings.length}):\n`);
    for (const f of findings) {
      console.error(`   ${f.file}:${f.line} — ${f.what}`);
      console.error(`      „${f.text}”`);
      console.error(`      → użyj ${f.fix} z src/branding.ts\n`);
    }
    console.error(`   Świadomy wyjątek? Dopisz w tej linii komentarz \`white-label-ok\`.\n`);
    process.exit(1);
  }

  console.log(
    `✅ White-label OK — ${literals} literałów w ${files} plikach src/, zero marki foundera w tekście dla widza.`,
  );
}

// Uruchamiamy CLI tylko przy bezpośrednim wywołaniu — testy importują scanText().
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
