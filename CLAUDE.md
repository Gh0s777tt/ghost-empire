# CLAUDE.md — working agreement for the Ghost Empire repo

Read this before making changes. It encodes how this repo stays healthy. The
**documentation rule** and the **Definition of Done** below are **mandatory**, not advisory:
a change is not finished until code, tests **and** docs are all green.

## Layout
- **`ghost-empire-web/`** — the Next.js 16 / React 19 / Prisma 7 app (this is where most work happens; run commands from here).
- **Repo root** holds the top-level docs: `CHANGELOG.md`, `ROADMAP.md`, `README.md`, `SECURITY.md`, plus `docs/` (see the map below).
- Sibling project `ghost-empire-chat` is the bot (separate repo/runtime).

## 🏢 Platform model — E-Forge (base) ⇄ Ghost Empire (founder tenant) (mandatory)
**E-Forge is the platform** — the white-label base *from which every other portal is created*, so any streamer can spin up and fully brand their own. **Ghost Empire is the founder tenant** — the owner's own portal (`slug: "ghost-empire"`, `isFounderBrand`), running **on** E-Forge with everything unlocked. Both are the **same codebase**; Ghost Empire is just the first, customised tenant. This has hard consequences for every change:

- **Every feature is a *platform* feature, never a "Ghost Empire" feature.** If you add or change something for Ghost Empire, it must work — and be reachable/configurable — for **every** tenant. There is no "just for my portal" path: land it for one ⇒ it lands for all. The same goes for **docs, regulaminy, FAQ and marketing copy** — a change to the product's rules/economy is a change for all portals, so update the shared (placeholder-driven) copy, not a Ghost-Empire-only version. (The one deliberately founder-voiced surface is the `about` page news feed.)
- **Never hardcode founder-specific values in shared, user-facing surfaces.** Brand name, currency name/symbol, Discord/socials, owner handle, colours, logo, background are **per-tenant config** (`Tenant` model — `name`/`shortName`, `tokenName`/`tokenSymbol`, `brandColor`, `logoUrl`, `socialLinks`, `ownerHandle`, …). Read them through:
  - `useTenantBranding()` (client → `tokenName`, `tokenSymbol`, `brandName`, `isPlatformBrand`),
  - `getCurrentTenant()` / `currentTenantId()` (server, `src/lib/tenant.ts`),
  - the `%tokenName%` / `%gt%` / `%brandShort%` / `%owner%` placeholders in `src/messages/*.json`,
  - the tenant's `socialLinks` (with the `SOCIALS` array in `SocialLinks.tsx` as the **documented founder fallback**).
  A literal `"Ghost Tokens"`, `"GT"`, `"Ghost Empire"`, `gh0s77tt`, or `discord.gg/deAPJ9Ym2F` in a **page/component/metadata/OG-image/email/bot output a tenant's viewer can see** is a **white-label leak** — fix it. (Admin-panel `placeholder=` hints, `x || "Ghost Tokens"` fallbacks, and seed data are legit defaults, not leaks.)
  - **Static `export const metadata` can't be tenant-aware** — when a title/description would otherwise bake in a brand or token name, convert the page to `generateMetadata({ params })` + `getCurrentTenant()`.
  - **Text that PERSISTS stores the marker; text that's ephemeral stores the resolved value.** A `Notification` row keeps its rendered message in the DB, so writers put `%gt%`/`%tokenName%` in it and the single reader (`GET /api/notifications`) resolves it via `applyTokenBranding` — that way a currency rename fixes old rows too, and one portal's history never shows another's currency. Ephemeral text (an API error body, a stream-alert label) resolves at write time, because nothing will re-render it. Surfaces with **no** resolver — bot chat replies, webhook payloads — must not receive markers at all; they'd leak literally.
- **When unsure "founder-only or platform?" → it's platform.** Gate genuinely founder-only behaviour behind `isFounderBrand` / `isPlatformBrand`, never behind a slug check sprinkled around the codebase. See `docs/PER-TENANT-IDENTITY.md` and `docs/WHITE-LABEL-SETUP.md`.

### Documentation surfaces (know where each kind of change lands)
| Surface | Where | Source of truth for | Regenerate / publish |
|---|---|---|---|
| Changelog | `CHANGELOG.md` | *What shipped, when, and under which PR* | hand-written; gated by `docs:check` |
| Roadmap | `ROADMAP.md` | *What's planned / in-progress / done* | hand-written |
| Readme | `README.md` | *The 60-second pitch + entry links* | hand-written |
| **User-facing & legal copy** | `src/messages/*.json` (**14 locales**) rendered by the `welcome` / `about` / `terms` (regulamin) / `privacy` pages | *The pitch, feature descriptions & legal terms users actually read in-app* | hand-written; **every locale in sync** |
| Guides & reference (the "wiki") | `docs/*.md` | *Architecture, endpoints, env, runbooks, FAQ* | hand-written |
| Website (docs site) | `docs/` → **MkDocs Material** (`mkdocs.yml`) | *Published docs at `gh0s777tt.gitlab.io/ghost-empire`* | `mkdocs build` (CI → GitLab Pages) |
| Code/API reference | `docs/api/**` | *Money-critical `src/lib/*` public API* | `npm run docs:api` (**TypeDoc**, generated — never hand-edit) |
| PDF handbooks | `ghost-empire-web/public/wiki/*.pdf` (served at `/wiki/`) | *Complete user guide + developer guide* | produced out-of-band; **flag for regen**, don't let drift. **Ze zrzutami ekranu** (nie sam tekst) — patrz „Standard prowadzenia projektu" §2 |

## 🔄 Zawsze zsynchronizowane — repo, docs, push (mandatory)

Właściciel nie chce backlogów ani braków. Każda sesja pracy jest „skończona" dopiero, gdy **kod +
testy + docs są zielone, zacommitowane I wypchnięte** — nic nie zostaje wiszące. Konkretnie:

1. **Nic niezacommitowanego na koniec.** Zero „zapomnianych" plików w working tree. Jeśli coś jest
   celowo odłożone, jest **śledzone** (wpis w `ROADMAP.md` / `docs/IDEAS.md` / TODO z właścicielem),
   nigdy po cichu porzucone.
2. **Docs aktualizowane NA BIEŻĄCO, nie na końcu** — razem ze zmianą, którą opisują (patrz dwie
   sekcje niżej): `CHANGELOG.md` (każda dowieziona zmiana), `ROADMAP.md` (status: 🟡→✅), `README.md`
   (pitch/feature'y/setup), właściwe `docs/*.md` (`ENDPOINTS`, `ARCHITECTURE`, `ENV`, `RLS`,
   `MAINTENANCE`…), i **otwarty PR/MR** dla wypchniętej gałęzi.
3. **Wszystko wypchnięte na OBA remote'y.** `origin` = GitHub, `gitlab` = GitLab (źródło prawdy /
   CI). Po zacommitowaniu → push na oba. Na koniec zweryfikuj: dla każdej pracującej gałęzi
   `HEAD == origin/<branch> == gitlab/<branch>`; zero commitów „ponad remote". Jeśli remote nie da
   się zautoryzować (sesja nieinteraktywna), powiedz to WPROST i zostaw dokładną komendę do pushu.
4. **Bez rozjazdu remote'ów i bez martwych gałęzi.** Po zmergowaniu gałęzi — usuń ją z obu remote'ów.
   Nie zostawiaj zmergowanych/porzuconych gałęzi jako śmieci (to też backlog).
5. **Definition of Done rozszerzone:** zmiana jest „done" dopiero, gdy wszystkie punkty Definition of
   Done niżej są spełnione **oraz** commit jest wypchnięty na oba remote'y i docs+CHANGELOG+ROADMAP
   odzwierciedlają stan. „Działa lokalnie" to nie „done".

Zasada nadrzędna: **jeśli po Twojej pracy zostaje jakikolwiek brak — niezacommitowany plik,
niewypchnięty commit, nieaktualny doc, nieotwarty PR, martwa gałąź — praca NIE jest skończona.**

## 🏛️ Standard prowadzenia projektu — zlecenie właściciela (mandatory)

Projekt ma być prowadzony **maksymalnie profesjonalnie**. Poniższe obowiązuje w **KAŻDEJ** sesji i
**na bieżąco** (razem ze zmianą, nie „na końcu", nie „kiedyś") — to część Definition of Done, nie
dodatek. Sekcje niżej (Documentation / User-facing copy / Definition of Done / Code-level docs)
opisują *jak*; ta sekcja jest nadrzędnym *co i dlaczego*.

1. **Cała dokumentacja żyje razem z kodem — nic nie ginie.** Każda zmiana widoczna w produkcie lub
   w API jest w tym samym kroku odzwierciedlona w: `CHANGELOG.md`, `ROADMAP.md`, `README.md`,
   `docs/*` (wiki/reference), **handbookach PDF** oraz copy user-facing/legal (14 locale). Żadna
   aktualizacja nie może wyjść **nieudokumentowana**. Czego nie da się dokończyć teraz — jest
   **śledzone** (ROADMAP / `docs/IDEAS.md` / TODO z właścicielem), nigdy po cichu porzucone.

2. **Wiki i PDF ze ZRZUTAMI EKRANU (nie sam tekst).** Handbooki (`public/wiki/*.pdf`) i strony wiki
   (`docs/*`) mają pokazywać, nie tylko opisywać — każda istotna funkcja dostaje **screeny z
   aplikacji**, żeby czytelnik z zewnątrz widział, o czym mowa. Gdy zmienia się UI funkcji, jej
   zrzuty są **nieaktualne** → oznacz do odświeżenia razem ze zmianą (PDF powstaje out-of-band, więc
   **zawołaj to wprost w opisie PR**, nigdy nie zostawiaj dryfu). Dąż do **interaktywnego PDF**
   (klikalny spis treści, zakładki, linki) tam gdzie się da — nowocześniej i czytelniej. **Zrzuty
   MUSZĄ być zredagowane** (patrz pkt 4).

3. **Oba remote'y + tagi + higiena gałęzi — na bieżąco.** `origin` (GitHub) i `gitlab` (GitLab)
   trzymane w synchronie; po commitcie → push na **OBA**. Na koniec pracy zweryfikuj: dla każdej
   gałęzi `HEAD == origin/<branch> == gitlab/<branch>`, zero commitów ponad remote, zero
   martwych/zmergowanych gałęzi (usuń z obu remote'ów), a **tag wersji** odzwierciedla stan wydania.
   Sesja nieinteraktywna i nie da się autoryzować remote'u → **powiedz to WPROST i zostaw dokładne
   komendy** (push / tag / merge); **nigdy nie udawaj, że wypchnięto/zmergowano.**

4. **Skan sekretów i danych prywatnych — na bieżąco (nie czekaj na CI).** Przy KAŻDEJ zmianie
   sprawdź, że w plikach trafiających do repo/publicznie (kod, `docs/`, wiki, **zrzuty ekranu**,
   `*.env.example`, seedy, przykłady) **nie ma** prawdziwych kluczy, tokenów, sekretów ani danych
   osobowych, które narażałyby projekt lub użytkowników. Sekrety wyłącznie w Vercel env / gitignored
   `.env*`. **Maskuj** tokeny / e-maile / nicki / PII na zrzutach, zanim trafią do wiki/PDF.
   Cokolwiek wyciekło → **zrotuj i zgłoś**. (Maszynowo pilnuje gitleaks w CI — ale to podłoga, nie
   sufit.)

5. **Porządek.** Utrzymuj ład w plikach, folderach i całej dokumentacji: spójne nazewnictwo, brak
   osieroconych / zduplikowanych / martwych plików, docs w miejscach z tabeli „Documentation
   surfaces", archiwalne migawki oznaczone datą i odesłane do żywych dokumentów.

6. **Dokumentacja dla kogoś z ZEWNĄTRZ.** Zakładaj czytelnika, który widzi kod pierwszy raz. Każda
   funkcja, moduł, narzędzie, skrypt i endpoint jasno mówi **co robi i PO CO istnieje** (patrz
   „Code-level documentation"). Cel: ktoś z zewnątrz dostaje **pełną** dokumentację i wie, co się
   dzieje — bez reverse-engineeringu.

7. **Kod „niebezpieczny" — uzasadnij albo usuń.** Każdy fragment o podwyższonym ryzyku (RNG /
   ekonomia / tokeny, `force-dynamic`, fail-open, zaszyte fallbacki, `dangerouslySetInnerHTML`,
   surowy SQL, omijanie guardów, `eval`, obsługa sekretów) ma **komentarz DLACZEGO tam jest** oraz
   świadomą weryfikację: **czy da się go usunąć** lub przerobić tak, by był **w pełni bezpieczny**?
   Jeśli zostaje mimo ryzyka — zapisz decyzję w `docs/DECISIONS.md` z uzasadnieniem, mitygacją i
   planem docelowym. Nie zostawiaj ryzykownego kodu bez wyjaśnienia.

> **Zasada nadrzędna:** jeśli po Twojej pracy zostaje **jakikolwiek** brak — nieudokumentowana
> zmiana, brakujący screen tam gdzie potrzebny, niewypchnięty commit, nieaktualny tag, martwa gałąź,
> sekret/PII w pliku publicznym, ryzykowny kod bez wyjaśnienia — **praca NIE jest skończona.**

## 📌 Documentation must never drift (mandatory)
Every change that ships behavior **must** update the docs in the same PR. `npm run docs:check`
(CI + local gate) fails if any PR shipped in recent git history is missing from `CHANGELOG.md`.
That check is the floor, not the ceiling — it only catches a missing changelog line, so the
rest of this list is on you.

When you ship a PR `(#NNN)`, walk this checklist and update **every** surface the change touches:

1. **`CHANGELOG.md` → `[Unreleased]`** — add an entry (newest first) under `### Added` / `### Changed` / `### Fixed`. Reference `(#NNN)`. Follow the existing style: bold title, 1–3 sentences, note any **db push**, end with `Zielone: tsc/<N> testów/eslint/build`.
2. **`ROADMAP.md`** — if the change completes or advances a roadmap item, flip its status (🟡 → ✅, strike-through done items) and/or extend the latest "🆕 Świeżo dowiezione" note. Don't leave a shipped feature marked TODO.
3. **`README.md`** — update if the change alters the pitch, the feature table, setup steps, or an entry link. The README is the front door; keep it truthful.
4. **`docs/` (guides & reference / the wiki + site)** — if you changed it, document it:
   - new/removed/changed API routes → `ENDPOINTS.md`
   - architecture / auth / data-model → `ARCHITECTURE.md` (and `SUBSYSTEMS.md`, `RLS.md`, `PER-TENANT-IDENTITY.md` when relevant)
   - new/changed env vars → `ENV.md` (enforced by `npm run docs:env` — fails if a `process.env.X` isn't documented)
   - ops / DevOps / release changes → `MAINTENANCE.md`
   - a new user-facing feature or workflow → the matching guide (`OWNER-SETUP.md`, `WHITE-LABEL-SETUP.md`, `OBS-CONTROL.md`, `LIGHTING.md`, `RAFFLE-BOT.md`, `faq.md`)
   - a multi-step/risky migration → its own `docs/*.md` runbook (see `PER-TENANT-IDENTITY.md`)
   - a new page must be added to `mkdocs.yml` `nav:` or it won't appear on the site. Keep status headers truthful ("planned" vs "shipped").
5. **`docs/api/**` (TypeDoc)** — if you touched a function in a money-critical lib listed in `ghost-empire-web/typedoc.json` (`secure-rng`, `economy`, `gt-games`, `wheel`, `collectibles`, `economy-anomaly`, `companion-token`, `platform-tokens`, `ssrf-guard`, `moderation`), write/refresh its TSDoc, then run `npm run docs:api`. ⚠️ **`/docs/api/` is gitignored** (`.gitignore:55`) — the markdown is generated by CI, so there is nothing to commit; you run it to prove the TSDoc actually resolves (TypeDoc fails on a broken `@link` or an undocumented referenced type). Adding a new money-critical lib? Add it to `typedoc.json` `entryPoints`.
6. **PDF handbooks (`public/wiki/*.pdf`)** — if a change materially alters the **user-facing product** (`E-Forge-Przewodnik-Kompletny.pdf`) or the **developer setup/architecture** (`Ghost-Empire-Developer.pdf`), the PDF is now stale. It's produced out-of-band, so you can't silently regenerate it — instead **call it out in the PR description** ("PDF handbook needs regen: …") so it's tracked and not forgotten.
7. Run **`npm run docs:check`** — it must be green before you consider the PR done.

Chore/merge/revert commits that genuinely need no changelog line may opt out with `[skip-changelog]` in the commit subject. Use sparingly. Docs-only PRs still get a `CHANGELOG` line by convention.

## 📣 User-facing & legal copy must never drift (mandatory)
The section above keeps the **developer** docs honest. This one keeps the **product's own pages** honest — the copy real users read. Whenever a change alters *what the product does for a user* (a new/removed feature, a changed economy or currency, a new page, a new price, an age-gate, anything affecting players' rights, money, or data), update these in the **same PR**:

1. **Welcome / landing** (`welcome` namespace) + **About** (`about` namespace) — keep the pitch and feature list truthful: add/rename features, kill stale claims (e.g. don't advertise a "1 PLN = 100 GT" rate that no longer exists).
2. **Regulamin / Terms** (`terms`) + **Privacy** (`privacy`) — update the legal terms whenever a change touches users' rights, money, data, or age-gating. Example already shipped: the casino runs on a **separate, free, non-purchasable, non-cashable "Żetony/Chips" currency**, is **18+**, and is entertainment — **not** gambling for money (`terms` §3). **Bump `terms.lastUpdated`** in every locale when the regulamin changes.
3. **FAQ + docs site** (`docs/faq.md`, `docs/index.md`) — answer the new "how does X work?" and reflect the feature in the overview.
4. **All 14 locales stay in sync** — this copy lives in `src/messages/<locale>.json` (`pl, en, de, es, fr, id, it, ja, ko, pt, ru, uk, zh, ar`). ⚠️ **A missing key does NOT break the build** — `src/i18n/request.ts` deep-merges each locale over EN, so an absent key silently renders **English**, which is exactly why drift here is invisible and unbounded. The machine-checkable guard is **`npm run docs:i18n`** (`scripts/check-i18n-legal.mjs`, wired into `verify-all` + CI): it **hard-fails** on any `privacy`/`terms` key missing from any locale, and reports the wider non-legal backlog as advisory. Add legal keys everywhere. **PL is authoritative** (Polish operator, Polish law governs the regulamin), EN careful, the rest faithful; **flag non-PL/EN legal wording for native/lawyer review**. A one-off script that surgically inserts a key into all 14 files (raw-text, `JSON.stringify` values, idempotent) beats 14 hand-edits — see the pattern used for `terms` §3. **Never round-trip a catalog through `JSON.parse` → `JSON.stringify`** — it silently drops one of every duplicate-key pair and reformats the whole file; edit raw text. **Never reuse a key name that's already taken in the same object**: `JSON.parse` keeps only the LAST one, so the earlier value becomes dead code and the surviving string renders in a place it was never written for — that is exactly how `admin.tntCreated` shipped a literal `{slug}` into the admin UI in all 14 locales. **`npm run docs:i18n:dup`** (`scripts/check-i18n-duplicates.mjs`) enforces this one; `docs:i18n` stays the legal-parity gate.
5. **PDF handbooks** (`public/wiki/*.pdf`) — flag for regen when the product materially changes (see the surfaces table).

Rule of thumb: **if a user would notice the change, a user-facing surface must describe it.** Legal wording that changes users' rights or money should also get a lawyer's eye.

## Definition of Done (a change is "done" only when all are true)
- [ ] Code compiles and the feature works (verified against the real flow, not just types).
- [ ] Tests cover the new/changed behavior and the full verify suite is green (see gates below).
- [ ] Every **new/changed function, script, endpoint, env var, and dependency/technology** is documented — **what it does and _why_ it exists** — on the right surface above.
- [ ] Public/exported API and non-obvious logic carry code-level docs (see next section).
- [ ] `CHANGELOG` / `ROADMAP` / affected `docs/` updated; `docs:check` green; PDF-regen flagged if needed.
- [ ] **User-facing behavior change?** The product's own pages reflect it — `welcome`/`about`/`terms`/`privacy` (all 14 locales) + `docs/faq.md` (see "User-facing & legal copy" above).
- [ ] **Wiki/PDF:** zrzuty ekranu dla zmienionego/nowego UI odświeżone albo **oznaczone do regenu** (żaden opis funkcji nie zostaje samym tekstem tam, gdzie screen pomaga) — patrz „Standard prowadzenia projektu" §2.
- [ ] **Sekrety/PII:** żaden prawdziwy klucz/token/sekret ani dane osobowe nie trafiają do plików publicznych **ani do zrzutów ekranu** (zredagowane) — §4.
- [ ] **Ryzykowny kod:** skomentowany „**dlaczego** tu jest" + świadoma weryfikacja „czy usuwalny / w pełni bezpieczny"; jeśli zostaje mimo ryzyka → decyzja w `docs/DECISIONS.md` — §7.
- [ ] **Repo:** zacommitowane i **wypchnięte na oba remote'y** (albo zostawione dokładne komendy push/tag/merge, jeśli sesja nieinteraktywna); tag wersji i gałęzie zweryfikowane, martwe gałęzie posprzątane — §3.

## Code-level documentation (write for the first-time reader)
The goal: someone opening a file cold should understand **what this code does and why**, without
reverse-engineering it. Comment intent, not the obvious.

- **File header** on every non-trivial module: 1–3 lines stating the module's purpose, *why* it
  exists, and any gotcha/invariant. Match the existing style — e.g. `scripts/check-docs-sync.mjs`
  and the `selectors.ts` headers in the sibling extensions are the bar.
- **TSDoc (`/** … */`) on every exported function, type, and public API** — one line of what,
  plus `@param`/`@returns` and a `@remarks`/`@example` where it helps. For the money-critical
  libs this TSDoc **is** the published API reference (TypeDoc reads it), so it's not optional.
- **Explain the _why_, not the _what_.** `// clamp to [0,1] so the RNG can't mint negative GT`
  earns its place; `// increment i` does not. Prefer a short comment over a clever one-liner that
  needs decoding.
- **Money-critical / security paths** (economy, RNG, tokens, moderation, SSRF, RLS) get a comment
  on every non-obvious invariant, bound, and "we do it this way because…". These are the places a
  silent regression costs real value — over-document them.
- **Match the surrounding code.** Comment density, naming, and idiom should read like the file you're
  editing, not like a different author dropped in.

## Verification gates (run from `ghost-empire-web/`, all must pass)
```
npx tsc --noEmit        # types
npx vitest run          # unit tests (pure logic; no DB/network mocks by convention)
npx eslint <changed>    # lint
npx next build          # production build
npm run docs:check      # CHANGELOG references every shipped PR
npm run docs:env        # every process.env.X is documented in docs/ENV.md
npm run docs:i18n       # privacy/terms present in every locale
npm run docs:i18n:dup   # no duplicate keys in src/messages/*.json (JSON.parse hides them)
```

**`npm run verify-all`** runs all of the above locally in one shot — typecheck · lint ·
docs:check · unit · **integration** (spins up a throwaway local Postgres via `postgresql@16`,
runs `test:integration`, tears it down) — plus `--build` for `next build`. Use it as the
pre-merge gate while CI is unavailable. A `pre-push` hook (`scripts/hooks/pre-push`) runs the
fast subset on every push; install it in a fresh clone with
`cp ghost-empire-web/scripts/hooks/pre-push "$(git rev-parse --git-path hooks)/pre-push"`.
Bypass a push in a pinch with `git push --no-verify`.

## Conventions that matter here
- **Multi-tenant**: almost everything is scoped per portal. New content/config models get a nullable `tenantId`, tenant-scoped reads/writes (`...(tid ? { tenantId: tid } : {})`), tenant-keyed caches, and per-tenant composite uniques (never a global `@unique` on a `code`/`name`). See `docs/ARCHITECTURE.md` §7 and `principle: everything per-portal`.
- **Prod DB mutations are gated**: `prisma db push` / seeds touch the live Supabase DB. Ask before each; `--accept-data-loss` only with explicit OK; back up before destructive constraint changes.
- **A new table is not finished until RLS is ON.** Postgres creates tables with RLS **off**, and Supabase auto-exposes every `public` table over PostgREST to the `anon` key — so a fresh table is readable/writable with the public key until you enable it. After ANY migration that adds a table run `ALTER TABLE "<t>" ENABLE ROW LEVEL SECURITY;` and **add no policy**: the app is Prisma-only and connects as the table owner (`rolbypassrls = true`), so RLS never applies to it, and enabling with no policy is default-deny for anon. Verify with `select count(*) … where not relrowsecurity` = 0. Runbook: `docs/RLS.md`. *(This was missed for all six tables added since #731 — `donation_integrations` was sitting there with `secretEnc`/`tokenEnc` exposed to the anon role.)*
- **Secrets** never go in code or chat — Vercel env / gitignored `.env*`. Rotate anything exposed.
- Branch off `main` for work; `main` auto-deploys to Vercel on push.

## Keeping quality & performance high (so future work stays cheap)
- **Add a new dependency/technology deliberately.** Justify it in the PR (what it buys, why not the
  stdlib/existing lib) and document how it's used. Every new tech is a maintenance cost — record the
  *why* so a future reader doesn't rip it out or re-add its equivalent.
- **New behavior ships with a test.** Bugs ship with a failing test first, then the fix. Pure logic
  lives in `src/lib/*` and is unit-tested without DB/network mocks (see gates).
- **Watch the money-critical hot paths.** Economy/games/wheel run often — prefer O(1)/O(log n) over
  re-scans, keep tenant-keyed caches warm, and avoid N+1 Prisma queries (batch with `include`/`in`).
- **Prefer clarity, then measure before optimizing.** Use `npm run analyze` (bundle) and
  `test:coverage` to find real hotspots instead of guessing.
- **Keep docs machine-checkable where possible.** `docs:check` is the model: if a class of drift
  keeps happening, add a guard script rather than relying on memory.
