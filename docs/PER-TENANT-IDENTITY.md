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
