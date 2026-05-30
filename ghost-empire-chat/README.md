# ghost-empire-chat 🤖💬

Chat bot for **Twitch + Kick + YouTube** — Phase 3A of Ghost Empire. Long-running
Node process (NOT Vercel). Connects to each platform's chat, runs custom commands,
and awards Ghost Tokens via the portal's internal API.

> **Status:** Twitch LIVE (commands + GT/min + token auto-refresh). Kick wired
> up — reads chat via Pusher websocket (no auth) and replies via the official API
> (`chat:write`); needs a dev.kick.com app + `npm run auth:kick`. YouTube next.
> Bot accounts + OAuth app credentials live in `.env` (gitignored).

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
