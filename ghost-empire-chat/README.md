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
- **Branding waluty (white-label)** — nazwa waluty w wiadomościach na czacie pochodzi z portalu (`GET /api/companion/branding`, cache z TTL 5 min), nie z env-ów. Zmiana `tokenName` w panelu wchodzi **bez restartu bota**; przy nieosiągalnym portalu bot mówi neutralnie („tokeny"), nigdy „GT".

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

## Bramki (uruchamiane z `ghost-empire-chat/`)

```bash
npm run typecheck    # tsc --noEmit
npm run lint:brand   # bramka white-label (AST) — zero founderowych literałów w copy na czat
npm test             # tsx --test src/__tests__/*.test.ts
```

Wszystkie trzy biegną w CI (`lint:chat` → typecheck + lint:brand, `test:chat` → test).

**`lint:brand`** (`scripts/check-white-label.ts`) chodzi po **AST TypeScripta** i failuje, gdy
founderowy literał („Ghost Tokens", „GT", „Ghost Empire", handle/Discord właściciela) trafi do
stringa albo templata, który może wyjść na czat widza. Świadomie pomija: komentarze (są trivią dla
parsera — `// 1 GT per chatter per minute` jest OK), argumenty `console.*` (logi operatora),
`src/__tests__/**` (test musi móc napisać „GT", żeby sprawdzić jego BRAK) oraz linie z
`// wl-ok: <powód>`. Wzorzec symbolu jest **case-sensitive**, więc współdzielony z portalem
placeholder `%gt%` przechodzi. Grep by tu nie wystarczył w obie strony: większość surowych trafień
w `src/` to komentarze, a copy dla widza jest **argumentem wywołania** (`broadcast(\`…\`)`) lub
zwracanym templatem — nie `field: "literal"`. Testy używają **wbudowanego runnera Node
(`node:test` + `node:assert`)** odpalanego przez `tsx` — **świadomie bez vitesta**: dev-tooling
bota to tylko `tsx` + `tsc`, a `node:test` pokrywa te przypadki bez dokładania zależności do
runtime'u, który chodzi 24/7 (nowa zależność = koszt utrzymania; patrz CLAUDE.md). Testy
`src/__tests__/branding.test.ts` pilnują tego, co naprawdę nośne w `src/branding.ts` — **nie**
„czy fetch działa", ale zachowanie przy AWARII: portal down → neutralne „tokeny" (nigdy „GT"),
niekompletny payload odrzucony (żadnego „obstawiaj undefined" na czacie), back-off zamiast
round-tripu na każdą wiadomość, brak rzutu w ścieżkę czatu. Zwalidowane mutation-testingiem:
podmiana fallbacku na `Ghost Tokens`/`GT` wywala 7 testów, usunięcie back-offu — 1.

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

- **Nazwa waluty NIE jest env-em.** `src/branding.ts` czyta ją z portalu (`GET /api/companion/branding` — publiczny, rozpoznaje tenanta po Hoście, rate-limit 120/min/IP) i cache'uje z TTL 5 min, więc: (a) nowy portal nie wymaga dodatkowych linii w `tenants/*.env`, (b) zmiana nazwy waluty w panelu propaguje się **bez restartu**, (c) nic nie może się rozjechać z wierszem `Tenant`. Portal nieosiągalny → wiadomości mówią neutralnie „tokeny/tokenów" (back-off 60 s), **nigdy** „GT". Kasyno (`!duel`, `!heist`, `!slots`) to osobna, platformowa waluta — **żetony** — i tam branding się nie stosuje (regulamin §3).
- `PORTAL_URL` instancji wskazuje **subdomenę tenanta** (`https://neo-zone.twoja-domena.com`) — portal rozpoznaje tenanta po Hoście, więc wszystkie nagrody/komendy/FAQ/timery lądują w danych właściwego portalu.
- `BOT_SECRET` instancji: **najlepiej własny sekret portalu** (`Tenant.botSecret` danego tenanta) — portal **scope'uje wtedy każdy lookup usera/GT do tenanta, do którego należy sekret**, więc instancja może ruszać wyłącznie SWOICH widzów. Globalny `BOT_SECRET` deploymentu portalu też jest akceptowany (kompatybilność wsteczna — tak działa bot założyciela), ale to klucz first-party: **nie dawaj go obcemu streamerowi**. Zero zmian w kodzie bota — to ta sama zmienna, tylko inna wartość. Skąd go wziąć: panel portalu `/admin#bot` → „Sekret bota portalu” (pokazywany **raz**, bez odczytu wstecz; rotacja unieważnia poprzedni natychmiast).
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

### Sekret bota per portal (`BOT_SECRET`)

Portal przyjmuje **dwa** rodzaje sekretu na trasach `/api/bot/*` i `/api/internal/*`
(`verifyBotSecretForTenant`, porównanie w stałym czasie):

1. **globalny `BOT_SECRET`** deploymentu portalu — działa dla każdego portalu (fallback,
   zawsze akceptowany);
2. **własny sekret portalu** (`Tenant.botSecret`) — dla instancji obsługującej ten jeden portal.

**Własny sekret generuje się w panelu portalu: `/admin#bot` → „Sekret bota portalu”**
(`POST /api/admin/bot-secret`). Wcześniej dało się go ustawić tylko wpisem prosto do bazy —
ten wyjątek już nie obowiązuje.

- Wartość pokazywana jest **dokładnie raz**, przy generowaniu. Panel nigdy jej potem nie
  odda (tylko „ustawiony” + 4 ostatnie znaki) — skopiuj ją od razu do `tenants/<slug>.env`.
- **Rotacja to twarde przecięcie**: stary sekret przestaje działać natychmiast, więc podmień
  env i zrestartuj proces bota. Zgubiony sekret = wygeneruj nowy, nie da się go odzyskać.
- „Usuń sekret” w panelu cofa portal do globalnego `BOT_SECRET`.
- Rotacja trafia do dziennika audytu portalu (bez wartości sekretu).
