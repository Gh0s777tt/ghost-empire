# ghost-empire-chat 🤖💬

Chat bot for **Twitch + Kick + YouTube** — Phase 3A of Ghost Empire. Long-running
Node process (NOT Vercel). Connects to each platform's chat, runs custom commands,
and awards Ghost Tokens via the portal's internal API.

> **Status:** Twitch + Kick LIVE (commands + GT/min + token auto-refresh).
> YouTube wired up (Option C — authorized as the channel account): `liveBroadcasts.list`
> auto-detects a live broadcast's `liveChatId`, then polls chat (1 unit) for GT/min and
> posts throttled command replies (insert = 50 units). Live-only + quota-aware; needs
> `npm run auth:youtube`. Bot/app credentials live in `.env` (gitignored).

## Architecture (v1 — runs on the streamer's PC, portable to a host later)

- **Self-contained:** the bot holds its own platform OAuth tokens in `.env` and
  connects outbound to each chat (Twitch IRC, Kick websocket, YouTube polling).
- **Economy:** calls the portal `POST /api/internal/award` with the shared
  `BOT_SECRET` (same pattern as the Discord bot) to grant GT for chat activity.
- **12-factor / portable:** all config via env vars, no hardcoded paths. Moving
  from PC → Railway / VPS / Cloudflare Containers later = set the same env vars
  + deploy (a `Dockerfile` will be added for container hosts).

## Setup (local)

```bash
cp .env.example .env     # then fill in (bot accounts are already prepared)
npm install
npm run auth:twitch      # one-time: log into the BOT account, click Authorize
npm run auth:kick        # one-time
npm run auth:youtube     # one-time
npm run dev              # connect + listen
```

## Security

- `.env` holds live secrets and is **gitignored** (root `**/.env`). Never commit it.
- The bot uses the **bot accounts'** OAuth apps; the streamer's main-account apps
  live in the portal (Vercel) and are not duplicated here.
