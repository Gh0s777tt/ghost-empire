# 🫵 OWNER-SETUP.md — actions only the owner can do

The web app ships **code-complete**; a handful of steps need the owner's live admin
session, real secrets, or a physical device — they can't be done in code/CI. This is the
single consolidated checklist (previously scattered across ENV.md / ROADMAP / CHANGELOG).

Legend: 🟢 do once now · 🔵 optional / when needed · 🔐 security hardening (recommended).

---

## 🟢 1. Backfill legacy rows to your tenant (one-time)
After the per-tenant migrations (#511 identity, #512 content, **#618 games**), some pre-existing
rows have `tenantId = NULL`. Attach them to your portal:

1. Sign in as **admin** on the live site.
2. In the **same browser tab**, open: `https://<your-domain>/api/admin/backfill-tenant`
   (plain GET; admin-gated + idempotent — safe to repeat).
3. Check the JSON response: `{ "ok": true, "tenant": "ghost-empire", "counts": { …, "game": N, … } }`.
   `game: N` = rows attached this run; a second run shows `game: 0` (idempotent).
4. Verify `/games`, `/ranking` etc. still show your data.

> The Steam/PSN/Xbox sync also self-heals via a bulk-claim on the next sync, but the backfill
> makes everything portal-scoped immediately.

## 🔵 2. Connect your game platforms (per portal) — `/admin#games`
- **Steam:** paste your SteamID/vanity → Save → Sync. (Needs `STEAM_API_KEY` in env.)
- **PSN (#626):** paste your **NPSSO** (from `ca.account.sony.com/api/v1/ssocookie`, expires ~60 days)
  in the "PSN NPSSO (this portal)" field → Save → **Sync PSN**. Stored encrypted at rest.
- **Xbox (#627):** generate an **OpenXBL API key** at `xbl.io` → paste in "Xbox key (this portal)"
  → Save → **Sync Xbox**. Stored encrypted at rest.
  > ⚠️ Xbox sync **needs a live test with a real key** — the OpenXBL response schema can't be
  > exercised locally. If a sync returns an error (e.g. `xbl.io 401/403` = bad/expired key, or an
  > unexpected shape), send the exact error text and the mapper (`lib/xbox.ts`) gets tuned to the
  > real payload.

## 🔵 3. Passkey live device test (#544, now on @simplewebauthn v13 #629)
WebAuthn needs HTTPS + a real authenticator, so it can only be validated on a device:
1. `/profile` → add a passkey (fingerprint / Face ID / device PIN).
2. Sign out → on the sign-in page click **"Sign in with a passkey"**.
3. Works → done. Fails → send the browser-console error; passkeys are isolated from OAuth, so a
   failure never affects normal sign-in.

## 🔐 4. Set a dedicated production `ENCRYPTION_KEY` (highest-leverage PII hardening)
Today, with no `ENCRYPTION_KEY` set, at-rest crypto (`lib/crypto`) derives its key from
`NEXTAUTH_SECRET`. That couples PII confidentiality to the session secret (rotating the auth
secret would brick all ciphertext + force TOTP/shipping re-entry, and widens blast radius).
1. Generate: `openssl rand -base64 32`.
2. Add `ENCRYPTION_KEY=<value>` to **Vercel → Project → Settings → Environment Variables** (Production).
3. Redeploy. The code already prefers `ENCRYPTION_KEY` over `NEXTAUTH_SECRET`.

> **Do this BEFORE any user saves shipping PII / enables TOTP** — existing ciphertext was written
> under the old key and won't decrypt after the switch. (Today there are ~none, so now is ideal.)
> **Post-quantum note:** PII is already AES-256-GCM (quantum-resistant); PQC belongs to TLS
> (Vercel/Supabase handle it at the edge). The real next step beyond a dedicated key is a managed
> **KMS / envelope encryption** — not an app-layer PQC library. See the audit report.

## 🔵 5. Wire the raffle into the chat bot (`ghost-empire-chat`)
The keyword-raffle web side is live (#611/#615) but **dormant until the bot calls it**. Implement
the contract in **[docs/RAFFLE-BOT.md](RAFFLE-BOT.md)** in the `ghost-empire-chat` repo: poll
`raffleKeywords` from `GET /api/bot/chat-commands`, POST hits to `POST /api/internal/raffle-entry`
(Bearer `BOT_SECRET`). The Discord bot (`../Bot DC`) is a different runtime — this is the
Twitch/Kick chat bot.

---

## 🔐 Infra hygiene (verify in the provider dashboards)
- **Vercel:** Pro confirmed (sub-daily crons — donation poll now `*/15`). Add any custom/tenant
  subdomains to `serverActions.allowedOrigins` in `next.config.ts` before they go live.
- **Supabase:** connect via the transaction pooler (`:6543`, `connection_limit=3`) — keep as-is.
  **✅ RLS enabled (2026-06-27, all 97 tables, #671)** — anon/PostgREST exposure closed as
  defense-in-depth; the Prisma app bypasses RLS (role `postgres`, `rolbypassrls=true`) so it's
  unaffected. ⚠️ New tables from a future `prisma db push` default to RLS **off** — re-run the
  matching `ENABLE` (runbook **[docs/RLS.md](RLS.md)**). Composite `[tenantId, <sort>]`
  ranking indexes already added (#638).
- **Upstash:** confirm `UPSTASH_REDIS_REST_URL/TOKEN` are set in prod — load-bearing for shared
  overlay reads + casino `withLock` correctness (degrades gracefully but multiplies DB reads without it).
- **Railway (bot):** ensure `/app/tokens` is a **persistent** volume (Kick rotates refresh tokens;
  ephemeral storage = broken Kick replies after every redeploy).
