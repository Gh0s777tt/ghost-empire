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
- **Economy:** calls the portal `POST /api/internal/chat-award` with `BOT_SECRET`
  (same pattern as the Discord bot) to grant GT for chat activity. The portal accepts
  either the platform-wide secret **or** this portal's own `Tenant.botSecret`, and
  scopes every user/GT lookup to the tenant that owns the secret + the request Host —
  so one portal's bot can never award another portal's viewer (see **Multi-tenant**).
- **Portal-managed:** commands / FAQ / timers / welcome / song-requests live in the DB and
  are fetched from `/api/bot/*` every ~2 min; the bot keeps minimal hardcoded fallbacks.
- **12-factor / portable:** all config via env vars, no hardcoded paths. Moving
  from PC → Railway / VPS / container host = set the same env vars + deploy
  (`Dockerfile` included — see **Hosting (24/7)** below).

## Setup (local)

```bash
cp .env.example .env     # then fill in (bot accounts are already prepared)
npm install
npm run auth:twitch      # one-time: log into the BOT account, click Authorize
npm run auth:kick        # one-time
npm run auth:youtube     # one-time
npm run dev              # connect + listen
```

## Hosting (24/7)

Na PC bot pada, gdy komputer śpi. Pod całodobowe działanie jest **`Dockerfile`** (outbound-only, brak portów do wystawienia):

```bash
docker build -t ghost-empire-chat .
docker run -d --restart unless-stopped --env-file .env \
  -v ghost-empire-chat-tokens:/app/tokens ghost-empire-chat
```

- **Railway / Render / Fly.io / VPS** — deploy z repo (root serwisu: `ghost-empire-chat`), ustaw te same env vary co w `.env`. Brak portów.
- ⚠️ **Kick rotuje refresh token** → bot zapisuje aktualny do `.kick-tokens.json`. Na efemerycznym hoście ten plik ginie przy redeployu i odpowiedzi Kicka przestają działać aż do ponownego `auth:kick`. **Zamontuj wolumen** (`-v …:/app/tokens`) — `Dockerfile` ustawia `KICK_TOKEN_STORE=/app/tokens/.kick-tokens.json`, żeby token przeżył restart.
- ⚠️ **YouTube:** ekran zgody OAuth w trybie „Testing" → token wygasa po 7 dniach (ustaw „In production" w Google Cloud Console).
- **Auth (`npm run auth:*`) robisz raz, lokalnie** (wymagają przeglądarki) — potem przenosisz wygenerowane tokeny do env hosta.

## Multi-tenant (SaaS fleet) — proces per portal

Bot jest w pełni parametryzowany env-ami, więc **każdy portal-klient = osobny proces bota** z własnym plikiem env:

```bash
cp tenants/example-tenant.env tenants/neo-zone.env   # uzupełnij
ENV_FILE=tenants/neo-zone.env npm start              # instancja klienta
npm start                                            # bez ENV_FILE = klasyczne .env (founder)
```

- `PORTAL_URL` instancji wskazuje **subdomenę tenanta** (`https://neo-zone.twoja-domena.com`) — portal rozpoznaje tenanta po Hoście, więc wszystkie nagrody/komendy/FAQ/timery lądują w danych właściwego portalu.
- `BOT_SECRET` instancji: **najlepiej własny sekret portalu** (`Tenant.botSecret` danego tenanta) — portal **scope'uje wtedy każdy lookup usera/GT do tenanta, do którego należy sekret**, więc instancja może ruszać wyłącznie SWOICH widzów. Globalny `BOT_SECRET` deploymentu portalu też jest akceptowany (kompatybilność wsteczna — tak działa bot założyciela), ale to klucz first-party: **nie dawaj go obcemu streamerowi**. Zero zmian w kodzie bota — to ta sama zmienna, tylko inna wartość.
- Każda instancja ma własny kanał Twitch/Kick/YT i własne (lub współdzielone konto bota) poświadczenia.
- Izolacja per proces = cache'e modułów (komendy/FAQ/timery/moderacja) naturalnie per portal. Docker: `--env-file tenants/neo-zone.env` + osobny wolumen tokenów Kick per instancja.
- Multipleksowanie wielu portali w jednym procesie ma sens dopiero przy dużej flocie (dziesiątki+) — wymaga przebudowy modułów na instancje; świadomie odłożone.

## Security

- `.env` holds live secrets and is **gitignored** (root `**/.env`). Never commit it.
- The bot uses the **bot accounts'** OAuth apps; the streamer's main-account apps
  live in the portal (Vercel) and are not duplicated here.
- **Give a third-party streamer their portal's own `Tenant.botSecret`, never the
  platform-wide `BOT_SECRET`.** The portal accepts both, but a per-tenant secret confines
  that instance to its own portal's viewers (the portal scopes every user/GT lookup to the
  tenant owning the secret + the request Host), while the platform key is the first-party
  founder credential.
- ⚠️ **Provisioning `Tenant.botSecret` is DB-only today** — there is no admin UI/API for it
  yet (the tenant PATCH endpoint's field allow-list doesn't include it, deliberately: it's a
  server secret). Set/rotate the column directly on the `tenants` row, then put the new value
  in that instance's env file and restart it. Until it's set, the instance must use the
  platform-wide `BOT_SECRET` (which still works — that's the back-compat path).
