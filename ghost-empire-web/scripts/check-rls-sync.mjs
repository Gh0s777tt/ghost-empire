// scripts/check-rls-sync.mjs
// Strażnik dryfu RLS: KAŻDA tabela (`@@map(...)`) ze `schema.prisma` musi mieć DOKŁADNIE jedną
// linię `ALTER TABLE public."<t>" ENABLE ROW LEVEL SECURITY;` w bloku **Step 2** `docs/RLS.md`
// — i odwrotnie: żadnej linii dla tabeli, której w schemie nie ma.
//
// DLACZEGO to istnieje (a nie „pamiętaj, żeby włączyć RLS"):
//   • Postgres tworzy tabele z RLS OFF, a Supabase auto-wystawia każdą tabelę `public` na kluczu
//     `anon` przez PostgREST — więc świeża tabela jest czytelna/zapisywalna publicznym kluczem,
//     dopóki ktoś ręcznie nie zrobi `ENABLE ROW LEVEL SECURITY`.
//   • W repo NIE MA `prisma/migrations/` — schema jedzie przez `db push`, więc blok Step-2 w
//     `docs/RLS.md` jest JEDYNYM odtwarzalnym artefaktem niosącym RLS. Baza odbudowana ze
//     `schema.prisma` + Step-2 dostaje RLS tylko dla tabel wymienionych w bloku; każda pominięta
//     ląduje otwarta na `anon`.
//   • To NIE jest hipoteza: dokładnie tak `donation_integrations` (z `secretEnc`/`tokenEnc`) i 8
//     innych tabel siedziało otwartych — blok listował 101 tabel przy 110 w schemie, a trzy różne
//     liczniki w doc (nagłówek/stopka/blok) nie zgadzały się ze sobą. Ten skrypt zamienia „zależne
//     od ludzkiej pamięci" w maszynową bramkę: dopóki blok ≠ schema, `verify-all`/CI failuje.
//
// Bramka jest STATYCZNA (parsuje pliki, zero połączenia z DB) — działa w CI bez sekretów.
// Sam ENABLE na prodzie to nadal owner-action w SQL Editorze (patrz docs/RLS.md); tu pilnujemy,
// by artefakt, z którego się to odtwarza, nigdy nie odjechał od schemy.
//
//   npm run docs:rls   (część lokalnych bramek verify-all + CI; docs muszą być w sync przed PR)
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = join(webRoot, "prisma", "schema.prisma");
const rlsDocPath = join(webRoot, "..", "docs", "RLS.md");

const fail = (msg) => {
  console.error(`\n❌ RLS.md out of sync ze schema.prisma.`);
  console.error(msg);
  console.error(
    `\n   Napraw blok „## Step 2" w docs/RLS.md (jedna linia\n` +
      `   \`ALTER TABLE public."<tabela>" ENABLE ROW LEVEL SECURITY;\` na każdy \`@@map\` w schemie),\n` +
      `   zaktualizuj licznik w nagłówku/stopce, i pamiętaj: po \`db push\` dodającym tabelę uruchom\n` +
      `   też pasujący ENABLE na prodzie (owner-action w Supabase SQL Editorze). Runbook: docs/RLS.md.\n`,
  );
  process.exit(1);
};

// --- 1. tabele ze schemy: nazwa = argument @@map (Prisma mapuje model → ta nazwa tabeli) ---
const schema = readFileSync(schemaPath, "utf8");
const schemaTables = new Set(
  [...schema.matchAll(/@@map\("([a-z0-9_]+)"\)/g)].map((m) => m[1]),
);

// --- 2. tabele z bloku „## Step 2" w RLS.md (NIE z canary Step-1 ani z bloku rollback DISABLE) ---
const doc = readFileSync(rlsDocPath, "utf8");
// UWAGA: kotwica `^## Step 2` (a nie indexOf) — sam nagłówek RLS.md cytuje w treści polecenie
// `sed -n '/^## Step 2/,...'`, więc naiwny indexOf("## Step 2") trafiał w ten cytat PRZED Step 1
// i łapał blok canary (samo `notifications`) zamiast właściwego bloku Step-2.
const step2Idx = doc.search(/^## Step 2\b/m);
if (step2Idx === -1) fail(`   Nie znalazłem sekcji „## Step 2" w docs/RLS.md.`);
// pierwszy ogrodzony blok ```sql ... ``` po nagłówku Step 2
const fence = doc.slice(step2Idx).match(/```sql\n([\s\S]*?)\n```/);
if (!fence) fail(`   Nie znalazłem bloku \`\`\`sql po „## Step 2" w docs/RLS.md.`);
const step2Lines = [
  ...fence[1].matchAll(/ALTER TABLE public\."([a-z0-9_]+)" ENABLE ROW LEVEL SECURITY;/g),
].map((m) => m[1]);
const docTables = new Set(step2Lines);
// Bezpiecznik: pusty blok = parser się zepsuł (a nie „schema pusta"). Bez tego złapanie 0 linii
// wyglądałoby jak „wszystkie tabele otwarte" i zalałoby raport 110 fałszywymi wpisami.
if (step2Lines.length === 0)
  fail(`   Sparsowałem 0 linii ENABLE w bloku Step-2 — regex/format się rozjechał, popraw parser.`);

// --- 3. porównanie: równość zbiorów + brak duplikatów w bloku ---
const missingFromDoc = [...schemaTables].filter((t) => !docTables.has(t)).sort();
const staleInDoc = [...docTables].filter((t) => !schemaTables.has(t)).sort();
const dupes = step2Lines.filter((t, i) => step2Lines.indexOf(t) !== i);

const problems = [];
if (missingFromDoc.length)
  problems.push(
    `   🔓 W schemie, BRAK w Step-2 (ta tabela wyjedzie na prod OTWARTA na anon):\n` +
      missingFromDoc.map((t) => `        ALTER TABLE public."${t}" ENABLE ROW LEVEL SECURITY;`).join("\n"),
  );
if (staleInDoc.length)
  problems.push(
    `   👻 W Step-2, BRAK w schemie (ALTER na nieistniejącej tabeli przerywa CAŁY paste w SQL Editorze):\n` +
      staleInDoc.map((t) => `        ${t}`).join(", "),
  );
if (dupes.length)
  problems.push(
    `   ♻️  Zduplikowane linie w bloku Step-2 (licznik kłamie, że jest komplet): ${[...new Set(dupes)].join(", ")}`,
  );

if (problems.length) fail(problems.join("\n\n"));

console.log(
  `✅ RLS w sync — wszystkie ${schemaTables.size} tabel (@@map) ma ENABLE ROW LEVEL SECURITY w bloku Step-2 docs/RLS.md; 0 osieroconych, 0 duplikatów.`,
);
