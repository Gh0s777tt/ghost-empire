# Per-tenant viewer identity — design & migration runbook

**Status: ✅ SHIPPED (2026-06-19).** Stage A (#510, additive `Account.tenantId` +
pre-positioned adapter) and Stage C (#511, the 2 unique flips + wired
`tenantAwarePrismaAdapter()`) are live on prod; the DB was migrated (column added →
backfilled → composites applied) and **login was verified live**. Per-portal
customizable content followed in #512 (quests, battle pass, custom alerts,
alert-type config, webhooks). The streamer-switch hub (#508, `/portals`) sits on top.
**Remaining = owner infra only** (not code): subdomains aren't activated until
`NEXT_PUBLIC_ROOT_DOMAIN` + wildcard DNS/cert + per-subdomain OAuth redirect URIs
exist — until then there's one portal, so the separate-per-portal effect is dormant
but in place. The sections below are the runbook that was followed (kept for the
subdomain-launch validation in §6).

Goal recap: **one human = one `User` per portal** (separate balance/level per portal),
enabling truly independent portals + the richest version of the streamer-switch hub (#7).

> ⚠️ **This is the highest-risk change in the codebase.** It rewrites the
> uniqueness invariants that authentication depends on. A subtle mistake can lock
> every existing user out of login — including the permanent-admin account. It must
> be rolled out in stages, validated on a non-production environment first, and kept
> trivially revertible. Do **not** ship it as a single big-bang merge to `main`.

---

## 1. Goal

Today the standard NextAuth `PrismaAdapter` + three **global** unique constraints
mean a given Twitch/Kick/YouTube/Google identity resolves to exactly **one** `User`,
anchored to whichever tenant they first signed up on. Signing in on a second
portal's subdomain logs you in as that same original user.

The target: signing in on portal **B** with the same provider identity yields a
**separate** `User` scoped to tenant B (its own tokens, level, achievements…),
distinct from your tenant-A user. Same person, independent presence per portal.

## 2. What actually blocks it (verified against the schema)

| # | Current (global) | Must become (per-tenant) | Why |
|---|---|---|---|
| 1 | `Account @@unique([provider, providerAccountId])` | `@@unique([provider, providerAccountId, tenantId])` + new `Account.tenantId String?` | One provider identity must be linkable once **per tenant**. |
| 2 | `User.email String? @unique` | drop field-level `@unique`; add `@@unique([email, tenantId])` | A person uses the **same email** on every portal → two users would collide. |
| 3 | `User.username String? @unique` | drop field-level `@unique`; add `@@unique([username, tenantId])` | Two portals may each have a "ghost_ab12" — only unique *within* a portal. |

Plus the **adapter** (`@auth/prisma-adapter`) is tenant-blind. We must wrap it
(`lib/auth-adapter.ts`) and override:

- `getUserByAccount({provider, providerAccountId})` → look up the account scoped to
  the current tenant (`OR tenantId = current OR tenantId IS NULL` during the
  transition; **self-heal** a NULL-tenant row by adopting it into the current
  tenant on first scoped login). A match for a *different* tenant must NOT be
  returned (so a fresh per-tenant user gets created instead).
- `getUserByEmail(email)` → scope to the current tenant, so
  `allowDangerousEmailAccountLinking` only ever links within one portal.
- `createUser(data)` → stamp `tenantId` atomically at creation.
- `linkAccount(account)` → stamp the account's `tenantId`.

`currentTenantId()` works inside adapter methods (they run during the auth request,
where `headers()` is available — the existing `signIn` callback already calls it).

## 3. The load-bearing assumption: per-subdomain session isolation

Sessions use `strategy: "database"` (the `Session` table, keyed by a cookie
`sessionToken`). **There is no `cookies`/cookie-`domain` override in `auth.ts`**, so
NextAuth issues **host-only** cookies. On distinct subdomains (`a.root.com`,
`b.root.com`) the browser keeps **separate** cookies → separate `Session` rows →
separate users. This is exactly what we need, and it is the default — **do not** set
a shared `.root.com` cookie domain, or all portals would collapse back to one
session/user. This assumption MUST be verified on staging (see §6).

## 4. Infra dependency (owner's side, not code)

Per-subdomain OAuth callbacks require each provider's OAuth app to accept the
per-subdomain (or wildcard) `redirect_uri`. With `trustHost: true`, NextAuth builds
the callback from the request Host, so `b.root.com/api/auth/callback/twitch` must be
a registered/allowed redirect on the Twitch (and Kick/Discord/Google) app, and
`NEXT_PUBLIC_ROOT_DOMAIN` + wildcard DNS/cert must be live. Until subdomains deploy,
this whole feature is dormant regardless of the code.

## 5. Safe migration ordering

Each step is independently reversible; the dangerous behavior change is isolated to
step C and pairs with an immediate backfill.

- **A. Add the column (additive).** Schema: add `Account.tenantId String?` +
  `@@index([tenantId])`. Keep all three OLD uniques for now. `prisma db push`
  (additive — no `--accept-data-loss`). **Merge the schema change only after the
  column exists on the target DB** (Prisma `SELECT`s every scalar column, so a
  generated client that knows `tenantId` errors against a DB that lacks it).
- **B. Backfill.** `scripts/backfill-account-tenant.ts`: for every account, set
  `tenantId = account.user.tenantId`. Idempotent. After this, no NULL-tenant
  accounts remain (legacy single tenant → founder tenant id).
- **C. Flip uniques + swap adapter (the dangerous step — together).** Schema: change
  the three uniques to their `tenantId` composite forms. Wire
  `tenantAwarePrismaAdapter()` into `auth.ts`. `prisma db push`. The NULL-tolerant
  self-heal in `getUserByAccount` covers any account that slipped through B.
  Validate login immediately; be ready to revert (see §7).

## 6. What CANNOT be verified locally (must use staging)

Single-tenant local dev with no subdomains can only confirm tsc/unit-tests/build and
that login still works for the *founder* tenant. It cannot confirm the actual goal.
On a staging deployment with ≥2 subdomains, verify:

1. Sign in on `a.staging` → user X (tenant A). Sign in on `b.staging` with the **same
   Twitch** → a **different** user Y (tenant B), each with its own balance.
2. Session isolation: being logged into A does not log you into B.
3. Email linking stays within a tenant (Discord-then-Twitch on B links to Y, not X).
4. Existing founder-tenant users log in unchanged (no duplicate/empty accounts).
5. OAuth callbacks resolve on each subdomain.

## 7. Rollback

- Step C is one commit (revert it → adapter falls back to the global `PrismaAdapter`)
  plus one schema revert (`db push` the three uniques back to global). Because the
  composite uniques are a **superset** constraint of the globals after backfill (one
  account per provider id per tenant, and historically one tenant), reverting is
  safe as long as no genuinely-cross-tenant duplicate accounts were created yet.
- Keep a DB snapshot/backup immediately before step C.

## 8. Open product question

Per-portal balances mean a viewer's GT on portal A is separate from portal B. Confirm
that's intended (vs. one wallet spanning portals). If a shared wallet is wanted, this
whole refactor is unnecessary — the #508 shared-identity hub already delivers
"switch between favorite streamers".

## 9. Related isolation surface: bot-facing endpoints (shipped)

Viewer identity (§2–7) is one half of per-tenant isolation; the **bot-facing money
and identity endpoints** are the other. Those endpoints authenticated with a single
global `BOT_SECRET` and matched the target `User`/`Connection` **globally** — so once
a streamer runs their own bot (the platform model), tenant A's bot could grant/farm/read
tenant B's users. That is now closed:

- **Auth** — `verifyBotSecretForTenant(auth, tenant.botSecret)` accepts the global
  `BOT_SECRET` (first-party bot, back-compat) **or** the portal's own `Tenant.botSecret`.
  The tenant is resolved from the request **Host** via `getCurrentTenantBotAuth()`
  (`lib/tenant.ts`) — the same Host-only rule as `currentTenantId()`, never the forgeable
  `x-tenant-slug`. `botSecret` is deliberately kept **out of** `TenantBrand` (server secret).
- **Scoping** — the target lookup is scoped with the same `...(tid ? { tenantId: tid } : {})`
  idiom used everywhere else: `internal/award` (by `discordId`), `internal/chat-award` +
  `bot/gt-game`/`heist`/`duel` (Connection via the `user.tenantId` relation — `Connection`
  has no `tenantId` of its own), `internal/link-status`, and the YouTube donor match in
  `yt/poll-live-chat` (scoped to the streamed portal; its auth stays global because that
  route is a platform cron sweeping every portal). `tid = null` (pre-backfill / outside a
  request scope) falls back to the legacy unscoped lookup, so the founder is unaffected.
- **Cross-repo, zero-break** — the bot is one process per portal and already sends a
  per-instance `BOT_SECRET` (`ghost-empire-chat/src/env.ts`). A tenant runs its own bot by
  setting `BOT_SECRET=<its Tenant.botSecret>`; the founder keeps the global secret. **No bot
  code change**, and nothing breaks on deploy. `link-discord`'s dupe-check stays global on
  purpose — `discordId` is globally `@unique`, so a scoped check would let a P2002 slip past
  the friendly 409.

Unlike §2's viewer-identity work, this needed **no schema change** (`Tenant.botSecret`
already exists) and **no `db push`**.

⚠️ **Open gap — provisioning is DB-only.** Nothing writes `Tenant.botSecret` yet: the admin
tenant PATCH (`/api/admin/tenants/[id]`) uses an explicit field allow-list that excludes it,
and no other code path sets it. So a streamer cannot self-serve their own bot secret — it has
to be written straight onto the `tenants` row. That's safe (the isolation above is enforced
whether or not a tenant has its own secret; without one they simply fall back to the global
`BOT_SECRET`), but until an owner-scoped admin surface exists — generate + show once + rotate,
never echoing the stored value back to the client — per-tenant bots stay a manual setup.

## 10. Related white-label surface: the bot's viewer-facing chat copy (shipped)

§9 closed the bot's **data** isolation; its **wording** was still the founder's. The bot wrote
`Ghost Tokens` / `GT` straight into sentences that every portal's viewers read in
Twitch/Kick/YouTube chat (`!portal`, `!sklep`, the open-bet auto-announce), which is the same
white-label leak class CLAUDE.md forbids in pages and emails — just in a different runtime.

**How the bot learns the currency: it asks the portal, and never stores it.**
`ghost-empire-chat/src/branding.ts` TTL-caches `GET /api/companion/branding` (5 min) and
exposes `getBranding()` / `applyBranding()`; `index.ts` warms it at boot. One process per
portal means `env.portalUrl` **is** that tenant's Host, and the endpoint is public +
Host-resolved + rate-limited, so no new credential and no new env var are involved.

Why not `TOKEN_NAME`/`TOKEN_SYMBOL` env vars — rejected deliberately:

- the value already lives in the `Tenant` row, so an env copy **silently drifts**: renaming
  the currency in `/admin` would leave the bot announcing the old name until somebody
  hand-edits an env file and restarts. The TTL'd read propagates a rename **without a restart**;
- `env.ts`'s `req()` throws on a missing var, so new *required* vars break every existing
  deployment, and *optional* ones force a founder-literal default (`?? "GT"`) back into the bot;
- one process per portal means every future `tenants/*.env` would carry the extra lines forever.

**Degradation rule (important):** a failed, slow, or half-filled branding fetch falls back to
**brand-neutral Polish** (`tokeny` / `tokenów`), never to `GT`. Generic wording is a cosmetic
miss; a wrong currency name is the leak. Failures back off (60 s) so a down portal cannot make
every chat message pay a round-trip, and the fetch never throws into the chat path (same
best-effort contract as `portal.ts awardChat()`).

⚠️ **`/api/companion/branding` is therefore no longer extension-only.** The bot has no session
and no user, so it can only read this while the route stays **public and unauthenticated**.
Adding auth or an extension-origin allow-list would silently send every portal's chat back to
the neutral fallback. The route header says so too.

**Chips are not white-label.** Casino wording is a separate axis: duels, heists and the chat
mini-games stake the **free `chips`** (`lib/duels.ts` / `lib/heist.ts` / `lib/gt-games.ts` all
move `chips`, never `tokens`), and per `terms` §3 chips are a **platform-wide** currency
distinct from the tenant-named `%gt%`. So their copy correctly says **`żetony`** — substituting
a tenant's `tokenName` there would be a *new* bug (advertising a chip game as costing the
portal's real currency). The bot said "napad na GT" / "pojedynek na GT" and
`bot/gt-game`+`bot/duel` answered "grać za GT" / "WYGRANA … GT"; all now say `żetony`.

**Tested behaviour.** `branding.ts` is covered by `ghost-empire-chat/src/__tests__/branding.test.ts`
(20 cases, CI job `test:chat`) using Node's built-in `node:test` runner via tsx — deliberately
**no vitest**, since the bot's whole dev tooling is tsx + tsc. The tests pin the *failure*
behaviour, which is the load-bearing part: neutral fallback and never `GT`, half-filled payload
refused, last-known-good surviving an outage, one request per burst, back-off instead of a
round-trip per message, no throw into the chat path. Validated by mutation testing — swapping the
fallback to `Ghost Tokens`/`GT` fails 7 cases, deleting the back-off fails 1.

**Guarded against regression: `npm run lint:brand`** (`ghost-empire-chat/scripts/check-white-label.ts`,
wired into the CI job `lint:chat`). The tests above pin `branding.ts`'s behaviour; this stops a
*new* founder literal being typed into any other chat string. It walks the **TypeScript AST** and
flags founder naming (`Ghost Tokens`, `GT`, `Ghost Empire`, owner handle, founder Discord) inside
string/template literals.

Why an AST and not grep — grep fails in **both** directions on this package:

- **False positives:** most raw `GT` matches in `src/` are comments and file headers, which are
  legitimate (`// 1 GT per chatter per minute`). The parser treats comments as trivia, so they
  drop out for free — no comment-stripping heuristics to maintain.
- **False negatives:** the bot's viewer text is a **call argument** or a returned template
  (`broadcast(\`…\`)`, `return \`@${u} …\``, `response: \`…\``), not a `field: "literal"`. A matcher
  written for `field: "literal"` / JSX attributes — the shape web-side brand linting assumes —
  reports a misleading **zero** on this package. Node-walking catches every position a literal can
  occupy, whatever syntax wraps it. Verified against a fixture: all three shapes above are caught,
  while comments, `console.*` diagnostics, the lowercase `%gt%` placeholder, the hyphenated
  `ghost-empire-chat` log prefix and regex literals are correctly ignored.

Deliberate exclusions: `console.*` arguments (operator logs, no viewer sees them),
`src/**/__tests__/**` (a test must be able to write `GT` to assert its absence), and any line
carrying a trailing `// wl-ok: <reason>` escape hatch. The currency-symbol pattern is
**case-sensitive** so the shared `%gt%` placeholder passes.

⚠️ **Still uncovered: the portal side.** `lint:brand` scans `ghost-empire-chat/src` only. The
`/api/bot/*` routes build chat messages too (that is how `WYGRANA … GT` reached chat), and no
equivalent guard exists in `ghost-empire-web`. Extending the same AST approach there — flagging
founder literals in any `NextResponse.json({ message: … })` — is the obvious follow-up.
