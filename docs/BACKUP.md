# 💾 BACKUP.md — off-site backup (dormant until configured)

A daily cron exports a JSON backup (config/catalog + user balances — **no secrets/PII**) and uploads it to an S3-compatible bucket. Off by default; turns on the moment you set the env (#677).

## What it backs up

The same data as the admin download (`/admin` → backup): **45 of the schema's 111 models** — configuration, content catalogs and user balances.

**Portal identity (white-label):** `Tenant` (name, currency name/symbol, colours, font, logo, background, socials, hub, plan, disabled features), `TenantCopy` (the portal's own welcome/about text), `OverlayScene` (scene builder output), `ObsRule` / `GoveeRule` / `HueRule` (automation).

**Catalogs & config:** shop, events, achievements, chat config (commands / timers / FAQ / welcome / bot), schedule, subathon, moderation, seasons + rewards, alert settings/types, codes, drops, polls, predictions, goals, overlay config, custom alerts/widgets, wheel, sound rewards, payment methods, sponsors, collectibles, trivia questions, penalties + config, games, clip director, support goals, bounties, daily tasks, song-request bans.

**User balances:** id / username / tokens / totalEarned / level / xp / streak / roles.

**Excluded — deliberately, with a reason recorded per model** (`MODELE_POZA_KOPIA` in `src/lib/backup.ts`):

| Class | Why |
|---|---|
| Credential stores (`Account`, `Session`, `Connection`, `IntegrationConfig`, `GameLibraryConfig`, the four streamer-token models, `StreamlabsConnection`, `DonationIntegration`, `PushSubscription`, `OutgoingWebhook`, …) | A backup must not carry secrets. After a restore the operator re-enters keys. |
| Personal data (`ShippingProfile`, `Donation`, `DonationClaim`, `SocialLink`, `SupportTicket`) | Addresses, phone numbers, e-mails, donor names. |
| Volume / ephemera (`ChatFeedMessage`, `StreamAlert`, `RateLimitBucket`, logs, platform event tables, …) | Rebuilds itself; in a backup it only bloats the file. |
| Gameplay history (`Transaction`, `GtGamePlay`, `Duel`, `Heist`, votes, entries, claims, `Clan`, …) | The backup carries **balances**, not the play-by-play that produced them. |

`Tenant` is read through a **positive `select`**, not "everything except these five" — with `omit`, every future secret added to the model would silently enter the backup. `botSecret`, `streamDeckToken`, `stripeCustomerId`, `stripeSubscriptionId` and `ownerEmail` stay out; `tokenName`/`tokenSymbol` are the **portal's currency name**, not credentials, and are exactly what a restore has to reproduce.

⚠️ **This coverage is enforced, not documented-and-hoped:** `src/lib/__tests__/backup-coverage.test.ts` reads `schema.prisma` and fails when any model is in neither list. Adding a model forces the decision "should a restore reproduce this?" instead of letting it vanish quietly — which is exactly how the backup drifted to **24 of 111 models**, losing every portal's branding and content on restore.

It is a **logical** export (Vercel serverless has no `pg_dump` binary).

## Enable (Vercel → Settings → Environment Variables)
| Var | Example | |
|---|---|---|
| `BACKUP_S3_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` | R2 endpoint (or your B2 / S3 endpoint) |
| `BACKUP_S3_BUCKET` | `ghost-empire-backups` | bucket name |
| `BACKUP_S3_ACCESS_KEY_ID` | … | bucket API key id |
| `BACKUP_S3_SECRET_ACCESS_KEY` | … | bucket API secret |
| `BACKUP_S3_REGION` | `auto` (default) | `auto` for R2; the real region for AWS S3 / B2 |

The cron runs **daily 05:00 UTC** (`vercel.json`), gated by `CRON_SECRET`. Objects land at `backups/ghost-empire-<UTC-timestamp>.json`.

## Verify
- Manually: `curl -H "authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/backup`
  - configured → `{ "ok": true, "uploaded": true, "key": "backups/…", "bytes": N }`
  - not configured → `{ "ok": true, "skipped": true, "reason": "BACKUP_S3_* not configured" }`
- Then check the bucket for the dated object.

## Notes
- **Whole-DB point-in-time recovery is Supabase's job** (dashboard → Database → Backups). This cron is an *extra* app-level snapshot of the configurable state — handy for quick restore/inspection and an off-Supabase copy.
- **Cloudflare R2** is a good default: generous free tier, **no egress fees**, S3-compatible.
- Uploads are SigV4-signed via `aws4fetch` (no AWS SDK dependency).
- Sub-daily cadence (if you ever want it) requires Vercel Pro — already in use for the 15-min Streamlabs poll.
