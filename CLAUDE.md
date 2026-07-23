# CLAUDE.md — working agreement for the Ghost Empire repo

Read this before making changes. It encodes how this repo stays healthy. The
**documentation rule** and the **Definition of Done** below are **mandatory**, not advisory:
a change is not finished until code, tests **and** docs are all green.

## Layout
- **`ghost-empire-web/`** — the Next.js 16 / React 19 / Prisma 7 app (this is where most work happens; run commands from here).
- **Repo root** holds the top-level docs: `CHANGELOG.md`, `ROADMAP.md`, `README.md`, `SECURITY.md`, plus `docs/` (see the map below).
- Sibling project `ghost-empire-chat` is the bot (separate repo/runtime).

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
| PDF handbooks | `ghost-empire-web/public/wiki/*.pdf` (served at `/wiki/`) | *Complete user guide + developer guide* | produced out-of-band; **flag for regen**, don't let drift |

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
5. **`docs/api/**` (TypeDoc)** — if you touched a function in a money-critical lib listed in `ghost-empire-web/typedoc.json` (`secure-rng`, `economy`, `gt-games`, `wheel`, `collectibles`, `economy-anomaly`, `companion-token`, `platform-tokens`, `ssrf-guard`, `moderation`), write/refresh its TSDoc, then run `npm run docs:api` and commit the regenerated markdown. Adding a new money-critical lib? Add it to `typedoc.json` `entryPoints`.
6. **PDF handbooks (`public/wiki/*.pdf`)** — if a change materially alters the **user-facing product** (`E-Forge-Przewodnik-Kompletny.pdf`) or the **developer setup/architecture** (`Ghost-Empire-Developer.pdf`), the PDF is now stale. It's produced out-of-band, so you can't silently regenerate it — instead **call it out in the PR description** ("PDF handbook needs regen: …") so it's tracked and not forgotten.
7. Run **`npm run docs:check`** — it must be green before you consider the PR done.

Chore/merge/revert commits that genuinely need no changelog line may opt out with `[skip-changelog]` in the commit subject. Use sparingly. Docs-only PRs still get a `CHANGELOG` line by convention.

## 📣 User-facing & legal copy must never drift (mandatory)
The section above keeps the **developer** docs honest. This one keeps the **product's own pages** honest — the copy real users read. Whenever a change alters *what the product does for a user* (a new/removed feature, a changed economy or currency, a new page, a new price, an age-gate, anything affecting players' rights, money, or data), update these in the **same PR**:

1. **Welcome / landing** (`welcome` namespace) + **About** (`about` namespace) — keep the pitch and feature list truthful: add/rename features, kill stale claims (e.g. don't advertise a "1 PLN = 100 GT" rate that no longer exists).
2. **Regulamin / Terms** (`terms`) + **Privacy** (`privacy`) — update the legal terms whenever a change touches users' rights, money, data, or age-gating. Example already shipped: the casino runs on a **separate, free, non-purchasable, non-cashable "Żetony/Chips" currency**, is **18+**, and is entertainment — **not** gambling for money (`terms` §3). **Bump `terms.lastUpdated`** in every locale when the regulamin changes.
3. **FAQ + docs site** (`docs/faq.md`, `docs/index.md`) — answer the new "how does X work?" and reflect the feature in the overview.
4. **All 14 locales stay in sync** — this copy lives in `src/messages/<locale>.json` (`pl, en, de, es, fr, id, it, ja, ko, pt, ru, uk, zh, ar`). A key a page references **must** exist in **every** locale or the build breaks — add it everywhere. **PL is authoritative** (Polish operator, Polish law governs the regulamin), EN careful, the rest faithful; **flag non-PL/EN legal wording for native/lawyer review**. A one-off script that surgically inserts a key into all 14 files (raw-text, `JSON.stringify` values, idempotent) beats 14 hand-edits — see the pattern used for `terms` §3.
5. **PDF handbooks** (`public/wiki/*.pdf`) — flag for regen when the product materially changes (see the surfaces table).

Rule of thumb: **if a user would notice the change, a user-facing surface must describe it.** Legal wording that changes users' rights or money should also get a lawyer's eye.

## Definition of Done (a change is "done" only when all are true)
- [ ] Code compiles and the feature works (verified against the real flow, not just types).
- [ ] Tests cover the new/changed behavior and the full verify suite is green (see gates below).
- [ ] Every **new/changed function, script, endpoint, env var, and dependency/technology** is documented — **what it does and _why_ it exists** — on the right surface above.
- [ ] Public/exported API and non-obvious logic carry code-level docs (see next section).
- [ ] `CHANGELOG` / `ROADMAP` / affected `docs/` updated; `docs:check` green; PDF-regen flagged if needed.
- [ ] **User-facing behavior change?** The product's own pages reflect it — `welcome`/`about`/`terms`/`privacy` (all 14 locales) + `docs/faq.md` (see "User-facing & legal copy" above).

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
