// scripts/check-white-label.mjs
// Strażnik dryfu white-label: KAŻDY literał identyfikujący portal-założyciela
// (Ghost Empire) wpisany na sztywno w kod, który widzi widz DOWOLNEGO portalu, jest
// wyciekiem — E-Forge jest bazą, z której każdy streamer tworzy własny portal, więc
// nazwa marki, waluta i handle właściciela to KONFIG PER-TENANT, nie stała w kodzie.
//
//   npm run docs:brand              (część lokalnych bramek + joba lint:web w CI)
//   npm run docs:brand -- --verbose (wypisz też ostrzeżenia „proza")
//
// DLACZEGO to istnieje (a nie „wystarczy pamiętać"): ta klasa dryfu wraca. Sam
// `amountLabel` alertu streamowego był zaszyty jako "GT" w PIĘCIU niezależnych
// miejscach (shop/buy, drops/claim, sound-rewards, admin/alerts, lib/auth) — każde
// dopisane osobno, każde niewidoczne w review. CLAUDE.md: „if a class of drift keeps
// happening, add a guard script rather than relying on memory".
//
// ZAKRES (celowo wąski — 100% sygnału, zero szumu):
//   TWARDA BRAMKA — literał, którego CAŁA treść to stała foundera ("GT",
//                   "Ghost Tokens", "Ghost Empire", "Gh0s77tt"), przypisany do pola
//                   obiektu / zmiennej / atrybutu JSX. To dokładnie kształt
//                   „zamiast tenant.tokenSymbol wpisano 'GT'".
//   TWARDA BRAMKA — literał ZAWIERAJĄCY handle foundera albo jego zaproszenie na
//                   Discorda — te są founder-specific niezależnie od otoczki
//                   (np. "https://twitch.tv/gh0s77tt").
//   OSTRZEŻENIE   — stała foundera w środku dłuższej prozy (`message`, `title`, …),
//                   np. `+${n} GT`. Realny dług, ale jego spłata to migracja i18n
//                   przez 14 locale, nie jednolinijkowa poprawka → NIE blokuje.
//
// Świadome ograniczenie: skaner jest liniowy (regex), nie parsuje AST. Nie złapie
// literału rozbitego na kilka linii ani sklejanego w runtime. To akceptowalny
// kompromis — łapie kształt, który realnie się powtarza, bez kosztu parsera w CI.
//
// ⚠️ ZAKRES TO WYŁĄCZNIE `ghost-empire-web/src`. Bot (`ghost-empire-chat/`) NIE jest
// skanowany i NIE wolno czytać zielonego wyniku jako „bot jest czysty". Matcher
// argumentów wywołań (CALL_ARG) powstał właśnie przy próbie przeskanowania bota — tam
// większość tekstu dla widza to `broadcast(\`…\`)`, nie przypisanie do pola — ale sam
// bot ma głębszy problem: jego per-tenant env (`tenants/*.env`) w ogóle nie ma nazwy
// waluty, więc „GT"/„Ghost Tokens" w komendach nie da się dziś nadpisać per-portal.
// To zadanie produktowe (knob w env albo pobieranie brandingu z portalu), nie skanera.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── Stałe foundera ───────────────────────────────────────────────────────────
// Odpowiadają 1:1 polom FALLBACK_TENANT (src/lib/tenant.ts) i SITE (src/lib/site.ts).
// Każda MA per-tenantowy odpowiednik, który należy odczytać zamiast literału.

/** Literał == dokładnie ta wartość → wyciek. `use` mówi, czym go zastąpić. */
export const FOUNDER_EXACT = [
  { value: "GT", use: "tenant.tokenSymbol (getCurrentTenant / useTenantBranding)" },
  { value: "Ghost Tokens", use: "tenant.tokenName (albo %tokenName% w i18n)" },
  { value: "Ghost Empire", use: "tenant.shortName (albo %brandShort% w i18n)" },
  { value: "GH0ST EMPIRE", use: "tenant.name (albo %brandShort% w i18n)" },
  { value: "Gh0s77tt", use: "tenant.ownerHandle (albo %owner% w i18n)" },
];

/** Literał ZAWIERA ten fragment → wyciek (founder-specific w każdym kontekście). */
export const FOUNDER_SUBSTRINGS = [
  { value: "gh0s77tt", use: "tenant.ownerHandle / tenant.socialLinks" },
  { value: "deAPJ9Ym2F", use: "tenant.socialLinks (zaproszenie Discord per-portal)" },
];

/** Stała foundera w prozie → tylko ostrzeżenie (dług i18n, nie blokujemy). */
const PROSE_FIELDS = new Set([
  "message", "title", "desc", "description", "body", "subject", "alt", "label", "text",
]);

/**
 * Wywołania, których pierwszy argument jest TEKSTEM dla człowieka — tylko dla nich
 * stosujemy tier „proza". Celowo wąska lista: `console.warn`/`createLogger` też biorą
 * string, ale log nie jest powierzchnią white-label, a szeroka reguła zalałaby raport.
 * (Reguła TWARDA — literał == stała foundera — działa dla KAŻDEGO wywołania.)
 */
const isMessageCall = (callee) => {
  const base = callee.split(".").pop() ?? callee;
  return /Error$/.test(base) || ["jsonError", "push", "broadcast", "say", "reply", "notify"].includes(base);
};
const PROSE_PATTERNS = [/\bGT\b/, /Ghost Tokens/i, /Ghost Empire/i, /gh0s77tt/i];

// ── Allowlisty (legalne przypadki wprost dopuszczone w CLAUDE.md) ────────────

/**
 * Pola, których wartość to WEWNĘTRZNY dyskryminator (enum w DB / union w typie), a
 * nie tekst dla widza. `Transaction.currency` przechowuje literalnie "GT" | "CHIPS"
 * — to klucz danych; przemianowanie go per-tenant zepsułoby zapytania ekonomii
 * (economy-health, cached.ts, wrapped, stream-recap filtrują po `currency: "GT"`).
 */
const INTERNAL_ENUM_FIELDS = new Set(["currency", "refundCurrency", "tokenCurrency"]);

/**
 * Pliki, które Z DEFINICJI trzymają domyślne wartości foundera — to źródła
 * fallbacku, na które powołuje się reszta kodu. CLAUDE.md dopuszcza je wprost
 * („documented founder fallback", „seed data", „`x || \"Ghost Tokens\"` fallbacks").
 */
const FALLBACK_SOURCES = new Map([
  ["src/lib/site.ts", "SITE — statyczny brand domyślnego tenanta (Phase 0)"],
  ["src/lib/tenant.ts", "FALLBACK_TENANT — brand, zanim istnieje wiersz Tenant"],
  ["src/lib/channels.ts", "FOUNDER_CHANNELS — udokumentowany fallback kanałów foundera"],
  ["src/lib/help-assistant.ts", "domyślny parametr `brand` asystenta"],
  ["src/components/TenantBranding.tsx", "domyślna wartość kontekstu klienckiego"],
  ["src/components/SocialLinks.tsx", "SOCIALS — udokumentowany fallback socials foundera"],
]);

/** Atrybuty JSX będące PODPOWIEDZIĄ w panelu admina, nie treścią dla widza. */
const HINT_ATTRS = new Set(["placeholder"]);

/** Poza zakresem: i18n (maszyneria %tokenName%), testy (fixture'y) i feed `about`. */
const isSkippedPath = (rel) =>
  rel.startsWith("src/messages/") ||
  rel.includes("/__tests__/") ||
  /\.(test|spec)\.tsx?$/.test(rel) ||
  // Feed newsów `about` to JEDYNA celowo founder-voiced powierzchnia (CLAUDE.md).
  rel === "src/app/[locale]/about/page.tsx";

// ── Skaner ───────────────────────────────────────────────────────────────────

/**
 * Wygaś komentarze (zachowując numerację linii i offsety), zanim ruszy detekcja.
 *
 * @remarks
 * Bez tego bramka łapie własne wyjaśnienia: komentarz „zastąpiono sentinel
 * `suffix: \"GT\"`" wygląda dla regexa identycznie jak realny wyciek. Komentarz
 * OPISUJĄCY zaszytą markę jest dokładnie tym, czego chcemy — dokumentacją — więc
 * nie może czerwienić CI. Prosty automat stanów (kod / string / // / block).
 *
 * Znane ograniczenie: literał regex zawierający `\/\/` może zostać wzięty za start
 * komentarza. Skutek to POMINIĘCIE tej linii (false negative), nigdy fałszywy alarm
 * — dlatego dodatkowo wymagamy, by przed `//` nie stał backslash.
 */
function blankComments(text) {
  const out = [];
  let state = "code";
  let delim = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (state === "code") {
      if (c === "/" && n === "/" && text[i - 1] !== "\\") { state = "line"; out.push("  "); i++; continue; }
      if (c === "/" && n === "*") { state = "block"; out.push("  "); i++; continue; }
      if (c === '"' || c === "'" || c === "`") { state = "str"; delim = c; }
      out.push(c);
      continue;
    }
    if (state === "line") {
      if (c === "\n") { state = "code"; out.push("\n"); } else out.push(" ");
      continue;
    }
    if (state === "block") {
      if (c === "*" && n === "/") { state = "code"; out.push("  "); i++; continue; }
      out.push(c === "\n" ? "\n" : " ");
      continue;
    }
    // state === "str"
    if (c === "\\") { out.push(c, n ?? ""); i++; continue; }
    if (c === delim) { state = "code"; out.push(c); continue; }
    if (c === "\n") { out.push("\n"); if (delim !== "`") state = "code"; continue; }
    out.push(c);
  }
  return out.join("");
}

// `field: "lit"` / `field = 'lit'` / `field: \`lit\`` / JSX `attr="lit"`.
// Cudzysłów MUSI stać zaraz po `:`/`=`, więc wyrażenia typu `x?.trim() || "GT"`
// (jawny fallback) w ogóle się nie łapią — o to chodzi.
const ASSIGNMENT = /([A-Za-z_$][\w$]*)\s*[:=]\s*(["'`])((?:\\.|(?!\2)[^\\])*)\2/g;

// `fn("lit"` — literał jako PIERWSZY argument wywołania. Druga, równie realna droga
// tekstu do widza: `jsonError("Za mało GT", 402)`, `throw new ClanError("…")`,
// `reasons.push(\`… GT\`)`. Bez tego matchera bramka dawała fałszywe poczucie pokrycia
// (ujawnione przy próbie przeskanowania bota, gdzie WIĘKSZOŚĆ tekstu ma ten kształt).
const CALL_ARG = /([A-Za-z_$][\w$.]*)\s*\(\s*(["'`])((?:\\.|(?!\2)[^\\])*)\2/g;

/** Jawny fallback `… || "GT"` / `… ?? "GT"` jest legalny wszędzie (CLAUDE.md). */
const isExplicitFallback = (line, literal) =>
  new RegExp(String.raw`(\|\||\?\?)\s*(["'\`])${literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\2`).test(line);

/**
 * Pozycja TYPU, nie wartości — `type LedgerCurrency = "GT" | "CHIPS"` opisuje kształt
 * danych w ledgerze, więc nie jest tekstem dla widza (i tak samo nie da się go
 * przetłumaczyć per-tenant). Rozpoznajemy deklarację typu oraz człon unii.
 */
const isTypePosition = (line, matchEnd) =>
  /^\s*(export\s+)?(type|interface)\b/.test(line) ||
  /^\s*\|/.test(line) ||
  /^\s*\|[^|]/.test(line.slice(matchEnd));

/**
 * Znajdź wycieki white-label w JEDNYM pliku źródłowym.
 *
 * Wydzielone i eksportowane, żeby dało się to przetestować jednostkowo bez I/O —
 * bramka pilnująca marki sama musi mieć testy (CLAUDE.md, Definition of Done).
 *
 * @param rel - Ścieżka pliku względem `ghost-empire-web/`, separatory `/`.
 * @param text - Treść pliku.
 * @returns `{ errors, warnings }` — listy `{ rel, line, field, literal, use, src }`.
 * @example
 * scanSource("src/app/api/x/route.ts", 'amountLabel: "GT",').errors.length // 1
 */
export function scanSource(rel, text) {
  const errors = [];
  const warnings = [];
  if (isSkippedPath(rel)) return { errors, warnings };
  // Plik-źródło fallbacku: stałe foundera są tu celem, nie wyciekiem.
  if (FALLBACK_SOURCES.has(rel)) return { errors, warnings };

  // Detekcja leci po kodzie BEZ komentarzy; raport cytuje oryginalną linię.
  const originalLines = text.split("\n");
  blankComments(text).split("\n").forEach((rawLine, i) => {
    const src = (originalLines[i] ?? rawLine).trim();
    // Inline escape hatch (spójne z bot-side ghost-empire-chat/scripts/check-white-label.ts):
    // linia z `// wl-ok: <powód>` jest ŚWIADOMIE wyłączona spod bramki. Jedyny legalny przypadek
    // to founderowy literał, który NIE jest wyświetlany — np. dyskryminant enuma waluty ("GT"
    // |"CHIPS") przekazany do funkcji jako argument, nie renderowany. Wymaga powodu po dwukropku.
    if (/\/\/\s*wl-ok:/.test(originalLines[i] ?? "")) return;
    const claimed = new Set(); // ten sam literał nie ma być zgłoszony dwa razy

    /** Wspólna ocena jednego trafienia, niezależnie od tego, który matcher je znalazł. */
    const consider = (name, literal, at, isProseSink) => {
      if (claimed.has(at)) return;
      const hit =
        FOUNDER_EXACT.find((f) => f.value === literal) ??
        FOUNDER_SUBSTRINGS.find((f) => literal.toLowerCase().includes(f.value.toLowerCase()));
      if (hit) {
        claimed.add(at);
        errors.push({ rel, line: i + 1, field: name, literal, use: hit.use, src });
      } else if (isProseSink && PROSE_PATTERNS.some((re) => re.test(literal))) {
        claimed.add(at);
        warnings.push({ rel, line: i + 1, field: name, literal, src });
      }
    };

    for (const m of rawLine.matchAll(ASSIGNMENT)) {
      const [full, field, , literal] = m;
      if (INTERNAL_ENUM_FIELDS.has(field) || HINT_ATTRS.has(field)) continue;
      if (isExplicitFallback(rawLine, literal)) continue;
      if (isTypePosition(rawLine, m.index + full.length)) continue;
      consider(field, literal, m.index, PROSE_FIELDS.has(field));
    }

    for (const m of rawLine.matchAll(CALL_ARG)) {
      const [, callee, , literal] = m;
      if (isExplicitFallback(rawLine, literal)) continue;
      consider(`${callee}()`, literal, m.index, isMessageCall(callee));
    }
  });

  return { errors, warnings };
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

function main() {
  const verbose = process.argv.includes("--verbose");
  const errors = [];
  const warnings = [];
  let scanned = 0;

  for (const file of walk(join(webRoot, "src"))) {
    const rel = relative(webRoot, file).split(sep).join("/");
    const res = scanSource(rel, readFileSync(file, "utf8"));
    errors.push(...res.errors);
    warnings.push(...res.warnings);
    scanned++;
  }

  if (warnings.length) {
    console.log(
      `ℹ️  ${warnings.length} literał(ów) marki foundera wewnątrz prozy (message/title/…) — ` +
        `NIE blokuje: spłata to migracja i18n przez 14 locale${verbose ? "" : "; szczegóły: --verbose"}.`,
    );
    if (verbose) for (const w of warnings) console.log(`     ${w.rel}:${w.line}  ${w.field}: "${w.literal}"`);
  }

  if (errors.length) {
    console.error(`\n❌ Wyciek white-label — marka foundera zaszyta w kodzie widocznym dla widza.`);
    console.error(`   E-Forge to baza dla KAŻDEGO portalu: to konfig per-tenant, nie stałe w kodzie.\n`);
    for (const e of errors) {
      console.error(`   ${e.rel}:${e.line}`);
      console.error(`     ${e.src}`);
      console.error(`     → użyj: ${e.use}\n`);
    }
    console.error(`   Legalny wyjątek? Dopisz plik do FALLBACK_SOURCES / pole do INTERNAL_ENUM_FIELDS`);
    console.error(`   w scripts/check-white-label.mjs — z komentarzem DLACZEGO.\n`);
    process.exit(1);
  }

  console.log(`✅ white-label czyste — ${scanned} plików src/, zero stałych foundera w kodzie dla widza.`);
}

// Uruchamiany jako skrypt (a nie importowany przez vitest) → wykonaj bramkę.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
