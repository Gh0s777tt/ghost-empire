# 💾 BACKUP.md — off-site backup (dormant until configured)

A daily cron exports a JSON backup (config/catalog + user balances — **no secrets/PII**) and uploads it to an S3-compatible bucket. Off by default; turns on the moment you set the env (#677).

## What it backs up
The same data as the admin download (`/admin` → backup): shop, events, achievements, chat config (commands / timers / FAQ / welcome / bot), schedule, subathon, moderation, seasons + rewards, alert settings/types, codes, polls, predictions, goals, overlay config, custom alerts/widgets, and **user balances** (id / username / tokens / totalEarned / level / xp / streak / roles). **Excluded:** auth tokens, emails, sessions, logs, chat feed — no secrets, no PII. It is a **logical** export (Vercel serverless has no `pg_dump` binary).

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
