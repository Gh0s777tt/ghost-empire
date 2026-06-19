# CLAUDE.md — working agreement for the Ghost Empire repo

Read this before making changes. It encodes how this repo stays healthy; the
documentation rule below is **mandatory**, not advisory.

## Layout
- **`ghost-empire-web/`** — the Next.js 16 / React 19 / Prisma 7 app (this is where most work happens; run commands from here).
- **Repo root** holds the docs: `CHANGELOG.md`, `ROADMAP.md`, `README.md`, `docs/` (`ARCHITECTURE.md`, `ENDPOINTS.md`, `ENV.md`, `IDEAS.md`, `PER-TENANT-IDENTITY.md`).
- Sibling project `ghost-empire-chat` is the bot (separate repo/runtime).

## 📌 Documentation must never drift (mandatory)
Every change that ships behavior **must** update the docs in the same PR. This is enforced by `npm run docs:check` (CI + local gates) — it fails if the latest PR number in git history isn't referenced in `CHANGELOG.md`.

When you ship a PR `(#NNN)`:
1. **`CHANGELOG.md` → `[Unreleased]`** — add an entry (newest first) under `### Added` / `### Changed` / `### Fixed`. Reference `(#NNN)`. Follow the existing style: bold title, 1–3 sentences, note any **db push**, end with `Zielone: tsc/<N> testów/eslint/build`.
2. **`ROADMAP.md`** — if the change completes or advances a roadmap item, flip its status (🟡 → ✅, strike-through done items) and/or extend the latest "🆕 Świeżo dowiezione" note. Don't leave a shipped feature marked TODO.
3. **`docs/`** — if you changed it, document it: new/removed API routes → `ENDPOINTS.md`; architecture/auth/data-model → `ARCHITECTURE.md`; new env vars → `ENV.md`; a multi-step/risky migration → its own `docs/*.md` runbook (see `PER-TENANT-IDENTITY.md`). Keep status headers truthful ("planned" vs "shipped").
4. Run `npm run docs:check` — it must be green before you consider the PR done.

Chore/merge/revert commits that genuinely need no changelog line may opt out with `[skip-changelog]` in the commit subject. Use sparingly.

## Verification gates (run from `ghost-empire-web/`, all must pass)
```
npx tsc --noEmit        # types
npx vitest run          # unit tests (pure logic; no DB/network mocks by convention)
npx eslint <changed>    # lint
npx next build          # production build
npm run docs:check      # documentation in sync
```

## Conventions that matter here
- **Multi-tenant**: almost everything is scoped per portal. New content/config models get a nullable `tenantId`, tenant-scoped reads/writes (`...(tid ? { tenantId: tid } : {})`), tenant-keyed caches, and per-tenant composite uniques (never a global `@unique` on a `code`/`name`). See `docs/ARCHITECTURE.md` §7 and `principle: everything per-portal`.
- **Prod DB mutations are gated**: `prisma db push` / seeds touch the live Supabase DB. Ask before each; `--accept-data-loss` only with explicit OK; back up before destructive constraint changes.
- **Secrets** never go in code or chat — Vercel env / gitignored `.env*`. Rotate anything exposed.
- Branch off `main` for work; `main` auto-deploys to Vercel on push.
