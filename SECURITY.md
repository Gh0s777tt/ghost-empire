# 🔐 Security Policy — Ghost Empire

Ghost Empire is a public, multi-tenant SaaS for streamers that handles a virtual
economy (Ghost Tokens), real-money tip/donation flows, OAuth logins and (dry-wired)
Stripe billing. We take security seriously.

## Reporting a vulnerability

**Please do NOT open a public issue for security problems.**

Report privately via **GitHub → the repository's *Security* tab → "Report a vulnerability"**
(GitHub Private Vulnerability Reporting). Include: what you found, where (file/route/URL),
reproduction steps, and the impact you think it has.

- We aim to acknowledge within a few days and to fix confirmed, high-impact issues promptly.
- Please give us reasonable time to remediate before any public disclosure.
- Good-faith research is welcome. **Do not** run attacks that degrade the service for others
  (DoS/load testing), access or modify data that isn't yours, or social-engineer users/staff.

## Scope

In scope: the `ghost-empire-web` app (portal + API + admin + OBS overlays) and the
bots (`ghost-empire-chat`, `E-Bot`). Out of scope: third-party platforms (Twitch, Kick,
YouTube, Discord, Stripe, Supabase, Vercel, Upstash) — report those to their owners.

## Security model (summary)

The codebase is hardened along these lines (see `docs/ARCHITECTURE.md` for detail):

- **Auth & sessions** — Auth.js v5 **database sessions**; per-tenant viewer identity;
  account-linking via a single-use HMAC-signed intent cookie. **Step-up 2FA (TOTP)** is
  required for the most destructive/privileged admin actions (DB reset, full backup,
  user merge, large GT grants, role grants).
- **Authorization** — layered guards: `requireAdmin` / `requirePermission` (mod perms) /
  `requirePlatformOwner` (admin-of-admins) / `requireTenantFeature` (plan gates) /
  `verifyBotSecret` (constant-time) / overlay-token. Every admin/bot/internal route is
  guarded; destructive global operations are platform-owner-only.
- **Tenant isolation** — the tenant is resolved **only from the request Host** (the
  `x-tenant-slug` header is stripped/re-set by the proxy and never trusted); tenant-owned
  reads/writes are scoped by `tenantId`.
- **Money integrity** — every GT movement runs in a `$transaction` with conditional
  `updateMany`/`gte` guards (overspend-proof), `SELECT … FOR UPDATE` row locks where a
  read-modify-write would otherwise race, and atomic Redis `GETDEL`/locks for stateful
  casino sessions. GT are integers (no float money); fees round in the house's favour.
- **Webhooks** — signatures verified against the raw body with constant-time comparison
  (Twitch HMAC, Kick RSA, Stripe, PayMedia), replay windows, and idempotency rows so a
  retried delivery can't double-credit.
- **Secrets at rest** — API keys and OAuth/streamer tokens are encrypted with AES-256-GCM
  (`lib/crypto.ts`). Infra secrets live in env (Vercel), never in code or the DB.
- **Abuse / cost controls** — per-IP and per-user rate limiting on public, auth and
  bot/AI endpoints; external API calls carry timeouts so a hung upstream can't pin the
  (small) DB connection pool.
- **Transport / browser** — CSP with a per-request nonce + `strict-dynamic` (no
  `unsafe-inline` scripts), HSTS preload, `frame-ancestors 'none'`, `object-src 'none'`,
  COOP; API responses `no-store`; OBS overlays `noindex`. OAuth `state` is HMAC-signed,
  TTL-bounded and provider-bound.
- **Auditability** — sensitive admin actions are recorded in an append-only audit log.

## Secret rotation

If a secret leaks (or for routine rotation), follow the runbook in
[`docs/ENV.md` §5](docs/ENV.md) — it lists, per secret, how to rotate it and the side
effects (e.g. rotating `NEXTAUTH_SECRET` signs everyone out; rotating `ENCRYPTION_KEY`
requires re-entering API keys and re-authorizing streamer tokens).

## Dependencies

`npm audit` runs in CI (non-blocking) and Dependabot + GitGuardian watch the repo.
Transitive advisories with no safe upgrade path are pinned via npm `overrides` where
possible (see CHANGELOG).
