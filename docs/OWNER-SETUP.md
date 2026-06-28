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

## 🔵 6. Turn on AI features — `/admin#integrations`
The whole AI layer (`lib/ai.ts`) ships wired but **dormant until a key is set** — there is none yet
on either portal (providers are pre-picked: `ghost-empire`→OpenAI, `e-forge`→Anthropic). Both
portals are `plan: elite`, so there is **no plan gate** — a key is all that's missing.
1. **`/admin#integrations` → "AI" card** → choose a provider + paste the API key → Save.
   Stored **encrypted at rest** (per portal). No deploy, no Vercel token needed.
   *(Alternatively set one global `AI_API_KEY` in Vercel env — it's the fallback for every portal
   that has no per-portal key, but then all portals share that one provider.)*
2. Unlocks: **@bot AI replies**, **chat moderation**, **stream recap**, **chat translation** (overlay
   `?translate=`), **semantic search** (`/search`), and **`!imagine`** image generation.
3. ⚠️ **Provider nuance (real, by design):** image gen (`!imagine`) and semantic-search embeddings
   **always call OpenAI** (`api.openai.com`), using whatever key you saved. So:
   - **OpenAI key → everything works** (chat + moderation + recap + translate + **images** + **search**).
   - **Anthropic/Grok/Gemini/DeepSeek/Bielik key → chat / moderation / recap / translate only** —
     `!imagine` and `/search` stay dark (the key isn't an OpenAI key). One key field per portal, so
     you can't mix. Given the OpenAI-only image/embed path, **OpenAI is the fullest-coverage choice.**
4. Two sub-features need one extra step each:
   - **Stream recap → Discord:** also paste a Discord **webhook URL** in the same Integrations card.
   - **Clip Director:** also re-auth the streamer's Twitch with the **`clips:edit`** scope (the AI key alone isn't enough).
5. Verify: in chat `@bot hello` / `!imagine a neon skull` should reply; `/search` returns semantic hits.
   Send me the portal + any error and I'll confirm it end-to-end on the live site.

## 🔵 7. Turn on Govee lighting — `/admin#integrations` + `/admin#goverules`
Per-portal smart-light reactions (#720–#724) — built, dormant until creds are entered.
1. **`/admin#integrations` → "Govee Lighting" card** → API key + device id + model → Save (encrypted).
2. **`/admin#goverules`** → add rules (event/min-amount → set colour / brightness / on-off, optional flash→revert).
3. Hit **"Test light"** to confirm creds + device respond. Runbook: **[docs/LIGHTING.md](LIGHTING.md)**.

## 🔵 8. Off-site backups (env)
Daily logical JSON dump → S3-compatible bucket is wired (#677) but dormant until the bucket env is set.
Add `BACKUP_S3_ENDPOINT` / `BACKUP_S3_BUCKET` / `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY`
(+ optional `BACKUP_S3_REGION` / `PREFIX`) in Vercel env → the nightly `cron/backup` ships. Runbook: **[docs/BACKUP.md](BACKUP.md)**.

## 🚧 NOT a key-paste — these need building first
The "dormant, waiting for keys" note over-promised two items. Verified against the code, they are
**not wired at all** (so adding a key does nothing — they're future development):
- **X (Twitter) — BUILT (#752), paste-in-panel:** `/admin#integrations` → "X (Twitter)" card → paste your
  **@handle** + an **X API v2 app Bearer token** (encrypted) → your follower count + latest posts render on
  `/about`. Dormant until set. ⚠️ reading posts needs an X API v2 token with **read** access (X's paid tier).
- **Instagram (Meta) — BUILT (#753), paste-in-panel:** `/admin#integrations` → "Instagram" card → paste your
  **IG Business-account id** + a **Graph API long-lived token** (encrypted) → follower count + latest posts on
  `/about`. ⚠️ needs an IG Business/Creator account + a Meta app whose **app review** is approved (business
  verification) for live data — built + dormant until then.
- **Facebook / TikTok — still need building:** only manual social *links* exist today; each = a per-platform
  dev-app + app review + connect flow. (Hue is the next slice.)
- **Philips Hue — creds card BUILT (#754), actuator pending:** `/admin#integrations` → "Philips Hue" card →
  paste your **bridge LAN IP** + a **bridge API key** (press the bridge button, generate a key). Stored encrypted.
  ⚠️ the Hue bridge is on your **LAN** (a cloud app can't reach it), so the light **actuator** runs as a
  **browser-source on your machine** (the OBS-control pattern) — that slice ships next. Govee (a cloud API) already
  drives lights server-side today, so Hue is for those who specifically have a Hue bridge.

---

## 🔐 Infra hygiene (verify in the provider dashboards)
- **Vercel:** Pro confirmed (sub-daily crons — donation poll now `*/15`). Add any custom/tenant
  subdomains to `serverActions.allowedOrigins` in `next.config.ts` before they go live.
- **Supabase:** connect via the transaction pooler (`:6543`, `connection_limit=3`) — keep as-is.
  **✅ RLS enabled (all 102 tables — #671, re-audited 102/102 in #731)** — anon/PostgREST exposure closed as
  defense-in-depth; the Prisma app bypasses RLS (role `postgres`, `rolbypassrls=true`) so it's
  unaffected. ⚠️ New tables from a future `prisma db push` default to RLS **off** — re-run the
  matching `ENABLE` (runbook **[docs/RLS.md](RLS.md)**). Composite `[tenantId, <sort>]`
  ranking indexes already added (#638).
- **Upstash:** confirm `UPSTASH_REDIS_REST_URL/TOKEN` are set in prod — load-bearing for shared
  overlay reads + casino `withLock` correctness (degrades gracefully but multiplies DB reads without it).
- **Railway (bot):** ensure `/app/tokens` is a **persistent** volume (Kick rotates refresh tokens;
  ephemeral storage = broken Kick replies after every redeploy).
