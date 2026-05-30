# ghost-empire-chat 🤖💬

Chat bot for **Twitch + Kick + YouTube** — Phase 3A + 3B of Ghost Empire. Long-running
Node process (NOT Vercel). Connects to each platform's chat, runs portal-managed commands /
FAQ / timers / welcomes / song requests, and awards Ghost Tokens via the portal's internal API.

> **Status (2026-05-30): LIVE na wszystkich 3 platformach.** 1 GT/min/widz, komendy
> zarządzane z portalu (`/admin#chat`), auto-refresh tokenów (Twitch reconnect 3 h ·
> Kick rotacja → `.kick-tokens.json` · YouTube live-only, quota-aware). Phase 3B gotowe:
> timery, FAQ, powitania, song requests, chat overlay. Credentials w `.env` (gitignored).

## Features

- **Ekonomia** — 1 GT/min/widz na każdej platformie przez `POST /api/internal/chat-award`.
- **Komendy** — zarządzane z portalu (`/admin#chat`), pobierane co ~2 min (bez redeployu).
- **FAQ / auto-odpowiedzi** — reakcja na słowa kluczowe (`/admin#faq`).
- **Timery** — cykliczne wiadomości broadcastowane na 3 platformy, tylko gdy czat aktywny (`/admin#timers`).
- **Powitania** — wita pierwszą wiadomość widza w sesji (`/admin#welcome`).
- **Song requests** — `!sr <link>` → kolejka w portalu (`/admin#songs`).
- **Chat overlay** — forwarduje wiadomości do portalu pod OBS source `/overlay/chat`.

Każda wiadomość przechodzi jeden pipeline per platforma: sygnał aktywności → `!sr` / komenda / FAQ → powitanie → naliczenie GT → feed do overlaya. Listy (komendy/FAQ/timery) i config (powitania) bot pobiera z portalu co ~2 min — zmiany w panelu wchodzą bez restartu.

## Architecture (v1 — runs on the streamer's PC, portable to a host later)

- **Self-contained:** the bot holds its own platform OAuth tokens in `.env` and
  connects outbound to each chat (Twitch IRC, Kick websocket, YouTube polling).
- **Economy:** calls the portal `POST /api/internal/chat-award` with the shared
  `BOT_SECRET` (same pattern as the Discord bot) to grant GT for chat activity.
- **Portal-managed:** commands / FAQ / timers / welcome / song-requests live in the DB and
  are fetched from `/api/bot/*` every ~2 min; the bot keeps minimal hardcoded fallbacks.
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
