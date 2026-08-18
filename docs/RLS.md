# 🔒 RLS.md — enable Row-Level Security in Supabase (defense-in-depth)

> **✅ APPLIED 2026-06-27 (#671) — RLS is ON for all public tables.** Verified the `postgres`
> connection has `rolbypassrls=true` (Prisma unaffected) and the app is Prisma-only (no
> `@supabase/supabase-js`/PostgREST), then enabled via a safe script: canary on `notifications` +
> read test → enable-all → verify (live app-reads OK) with auto-rollback on any failure.
> **Re-audited live (2026-08-18): 112/112 public tables have RLS ON, 0 open** (count grew from the original 97
> as tables shipped since #671 — e.g. `govee_rules` #721, `song_request_bans` #729, and the #807
> sweep that found `donation_integrations` sitting open with `secretEnc`/`tokenEnc` in it — each
> enabled via the post-`db push` step below).
> This doc is retained as the runbook + rollback reference. **Re-run the matching `ENABLE` line
> after any future `db push` that adds a table** (new tables default to RLS off).
>
> **111 is not a vibe — it is `grep -c '@@map' ghost-empire-web/prisma/schema.prisma`.** Header,
> the Step-2 block and the footer must all state that one number and it must equal that grep;
> re-derive both sides before you touch this file (`sed -n '/^## Step 2/,/^```$/p' docs/RLS.md |
> grep -c 'ENABLE ROW LEVEL SECURITY'`). ⚠️ **Why this matters more than a stale counter usually
> would: there is NO `prisma/migrations/` directory anywhere in this repo** — the schema ships by
> `db push`, so this file is the *only* replayable artefact that carries RLS at all. A database
> rebuilt from `schema.prisma` + a short Step-2 block ships the missing tables **open to the
> Supabase `anon` key**. That is precisely the state this doc was in: it listed 101 tables against
> a 110-table schema while the header claimed 102 and the footer 97 — three numbers, none of them
> right. The 9 that were missing entirely: `auctions`, `auction_bids`, `donation_claims`,
> `donation_integrations`, `hue_rules`, `penalties`, `penalty_config`, `penalty_draws`,
> `support_tickets`. Two of those are the expensive kind — `donation_integrations` holds Ko-fi
> verification tokens and provider signing keys (`secretEnc`/`tokenEnc`), and `support_tickets`
> holds viewer-submitted free text.
>
> ⚠️ **CHANGELOG #807 lists a tenth table, `ghost_live_state` — it no longer exists in
> `schema.prisma`.** It is deliberately NOT in the block below: `ALTER TABLE` on a dropped table
> aborts the whole paste in the SQL Editor. Said plainly here rather than silently omitted, so the
> next reader diffing the changelog against this runbook doesn't "restore" a phantom line.

**Owner action — run once in the Supabase SQL Editor.** This is intentionally NOT a Prisma
migration: RLS is raw Postgres DDL, lives in the DB (not `schema.prisma`), and a wrong
assumption about the connecting role could deny every query → so it belongs in your console
where you can verify + roll back instantly, not in an automated `db push`.

## Why
The app talks to Postgres **only via Prisma**, connecting as the table **owner** role (the
`postgres` role that ran the migrations). RLS does **not** apply to a table's owner (unless you
`FORCE` it), so enabling RLS leaves the Prisma app **completely unaffected**.

But Supabase *also* auto-exposes a **PostgREST API** on the `anon` / `authenticated` roles
(your project's anon/public key). Today every `public` table has **RLS disabled**, so if that
anon key ever leaked, those tables would be readable/writable over the REST API — bypassing the
app's tenant scoping entirely. Enabling RLS **with no policy** makes Postgres **default-deny**
for `anon`/`authenticated` (they get zero rows), closing that surface — while the owner (Prisma)
keeps full access. This is exactly Supabase's recommended baseline ("enable RLS on all tables in
`public`").

> ⚠️ **Do NOT add `FORCE ROW LEVEL SECURITY`** — that makes RLS apply to the owner too, which
> would break the Prisma app. Plain `ENABLE` is what you want.

## Step 1 — canary (recommended, ~30 s)
Confirm the app's role really bypasses RLS before doing all 111 tables. Run on **one** low-risk table:
```sql
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
```
Now load the live site while signed in (anything that reads notifications — the bell). If it
still works → the owner bypasses RLS as expected, proceed to Step 2. If it 500s → roll back that
one table immediately and stop (your connection role is NOT the owner; ping me):
```sql
ALTER TABLE public."notifications" DISABLE ROW LEVEL SECURITY;
```

## Step 2 — enable on every public table
Paste this whole block into the Supabase SQL Editor and run it. **111 lines, one per `@@map` in
`schema.prisma`** — if your `grep -c '@@map'` says something else, the schema moved and this block
is stale, not the schema:
```sql
ALTER TABLE public."accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."achievements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."admin_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."alert_type_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."auction_bids" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."auctions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."auto_clips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."bot_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."bounties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."bounty_pledges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."card_listings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_activity_buckets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_commands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_feed_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_overlay_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_timers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."clan_wars" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."clans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."clip_director_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."clip_votes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."code_drop_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."collectibles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."companions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."custom_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."custom_widgets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."daily_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."discord_link_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."donation_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."donation_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."donations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."drop_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."duels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."emoji_combo_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."event_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."faq_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."game_library_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."game_votes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."games" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."govee_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."gt_game_plays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."heist_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."heists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."hue_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."hype_train_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."integration_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."kick_event_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."kick_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."kick_streamer_token" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."league_season_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."mod_violation_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."moderation_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."outgoing_webhooks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."obs_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."overlay_scenes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."passkeys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payment_methods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."penalties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."penalty_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."penalty_draws" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."poll_votes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."polls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."portal_follows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."prediction_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."predictions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."raffle_tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."rate_limit_buckets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."season_rewards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seasons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shipping_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."social_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."song_request_bans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."song_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sound_rewards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sponsors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stream_alert_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stream_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stream_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stream_drops" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stream_goals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stream_schedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stream_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."streamlabs_connection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."subathon" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_goals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tenant_copy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."trivia_answers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."trivia_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."twitch_event_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."twitch_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."twitch_streamer_token" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_achievements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_collectibles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_season_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_season_reward_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."verification_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."welcome_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."wheel_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."wheel_spins" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."youtube_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."youtube_streamer_token" ENABLE ROW LEVEL SECURITY;
```

## Step 3 — verify
- Supabase dashboard → Database → Tables: the **"RLS disabled in public"** / "Unrestricted"
  warnings should be gone for all tables.
- The live app keeps working end-to-end (home, `/admin`, login, overlays). If **anything** 500s,
  run the rollback below immediately — RLS toggles take effect instantly, no data is touched.

## Rollback (instant, no data loss)
```sql
ALTER TABLE public."accounts" DISABLE ROW LEVEL SECURITY;
-- …repeat for every table above, swapping ENABLE → DISABLE…
ALTER TABLE public."youtube_streamer_token" DISABLE ROW LEVEL SECURITY;
```
(Fastest: re-run the Step-2 block with `ENABLE ROW LEVEL SECURITY` replaced by
`DISABLE ROW LEVEL SECURITY`.)

## Scope note — this is the baseline, not per-row policies
This closes the **anon/PostgREST** exposure (the realistic risk today). Writing per-row tenant
**policies** (so even an *authenticated* PostgREST user only sees their own tenant/rows) is a
much larger effort and only matters if you ever query Supabase via the JS client / PostgREST
directly — **the app never does today (Prisma only)**, so the baseline above is the correct
scope. The app's own per-portal isolation remains enforced at the application layer
(`...(tid ? { tenantId } : {})`), with RLS as defense-in-depth behind it.

> New tables added later default to RLS **off** — re-run the matching `ENABLE` line after any
> future `prisma db push` that adds a model, **and add it to the Step-2 block in the same commit**.
> (Keep `schema.prisma` the source of truth; this doc lists the tables as of the current schema,
> **111 tables** — the same number as the header and as `grep -c '@@map'`. The two-step "enable it
> live, document it later" is exactly how 9 tables — including `donation_integrations` with its
> `secretEnc`/`tokenEnc` — ended up absent from the only artefact that can rebuild RLS.)
> Live check that this file is still true: `select count(*) from pg_class c join pg_namespace n on
> n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;`
> → must be **0**.
