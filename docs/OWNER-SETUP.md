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

## 🔵 9. Connect DonationAlerts (the only rail that credits viewers automatically)

Built and wired (#805), **dormant until you register one OAuth app**. Every other donation rail
either needs your approval per donation (Tipply, the generic webhook) or a token pasted per portal
(Ko-fi). DonationAlerts is the one where a viewer who puts their `GE-XXXXXX` code in the donation
message gets credited **with no human in the loop** — because we read the donations with a
credential you granted us, straight from the vendor's API.

**Register ONE app for the whole platform, not one per portal.** A single app means a single
registered redirect URI; which portal a grant belongs to travels inside the signed OAuth `state`,
not in the URL.

1. **Work out the redirect URI for every portal you will connect from.** The portal builds it from
   **the host you are actually on**, so it is one per portal:

   ```
   https://<that-portal's-domain>/api/auth/donationalerts/callback
   ```

   e.g. `https://empire-forge.com/api/auth/donationalerts/callback`.

   This is deliberate and load-bearing. Production leaves `NEXTAUTH_URL` unset when portals run on
   their own domains (see `docs/ENV.md`), so pinning the callback to one constant host would send the
   admin of every other portal to a callback where the CSRF nonce cookie this flow just set does not
   exist — the connect would fail every time, for every portal but one. Deriving from the request
   keeps the start route, the cookie and the callback on the same origin, and makes both ends compute
   the identical `redirect_uri` the vendor demands at token exchange.
2. **Create the app:** <https://www.donationalerts.com/application/clients> → *New application*.
   - **Redirect URI:** the URL from step 1, exactly — no trailing slash, `https`, same case.
     If the vendor's form accepts several, add one line per portal. **If it accepts only one**, that
     app can serve one portal; register the portal you actually collect on, and create a second
     application for the next portal (the credentials are read from env, so a second app means a
     second deployment-level value — tell me and I will make them per-portal instead).
   - **Scopes:** `oauth-user-show` and `oauth-donation-index`. Do **not** grant
     `oauth-donation-subscribe`; the portal polls and does not need the push stream, so a wider
     grant would buy nothing and widen the blast radius if the credential ever leaked.
3. **Put the credentials in Vercel** (Project → Settings → Environment Variables, *Production*):
   - `DONATIONALERTS_CLIENT_ID`
   - `DONATIONALERTS_CLIENT_SECRET`

   These are **platform-level**, not per portal — like the Streamlabs pair. Redeploy (or let the
   next push deploy) so the running functions pick them up.
4. **Connect each portal:** `/admin` → **"Integracje donacji"** → the **DonationAlerts** card →
   **"Połącz"**. You are sent to DonationAlerts, you approve, and you land back on `/admin` with
   `?da_ok=1`. Repeat while logged into each portal you own — one grant per portal, stored
   encrypted on that portal's row.
5. ⚠️ **The FIRST poll after connecting deliberately credits nothing.** It only records where the
   feed currently is. The vendor always returns the most recent page of donations, so ingesting it on
   connect would replay your donation history as live, **auto-credited** income — with no human in the
   loop. So the first tick primes and stays silent; the tick after it starts crediting. Do not read
   the quiet first 10 minutes as a broken setup.
6. **Verify** (the honest check, not "it looks fine"):
   - the card shows **"Połączono ✓"** and, after the first donation, a **"Ostatnia wpłata"** time;
   - send yourself a small real donation with your own `GE-XXXXXX` code in the message — within
     ~10 minutes (the cron interval) the currency lands and the donation appears **credited**, not
     in the reconciliation queue;
   - a donation **without** a code appears in the queue for you to assign, which is correct.

**Failure modes and what they mean, so a stalled rail is never mistaken for a quiet day:**

| What you see | What it means |
|---|---|
| `?da_error=not_configured` | The two env vars are missing or the deploy predates them. |
| `?da_error=state_mismatch` | The CSRF binding failed — usually a stale tab or a blocked cookie. Start from `/admin` again. |
| `?da_error=no_refresh_token` | The vendor returned a grant we cannot renew; it is **refused on purpose** rather than stored to die silently days later. Re-authorize. |
| `lastError` on the card | The last poll failed — the text names the cause. `expired_and_no_refresh_token` means reconnect; an HTTP code means the vendor. It is also in Sentry, and the cron answers non-200 so uptime monitoring sees it. |

⚠️ **Removing the integration in the panel stops us using the grant, but does not revoke it at the
vendor.** To fully revoke, also remove the application's access in your DonationAlerts account.

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
