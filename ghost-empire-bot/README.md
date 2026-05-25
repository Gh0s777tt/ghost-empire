# Ghost Empire — Discord Bot

Bot tracking aktywności Discord (wiadomości + voice) i obsługa slash commands. Komunikuje się z portalem `ghost-empire-web` przez bearer-auth internal API.

## Architektura

```
┌────────────┐         ┌───────────────────────┐         ┌───────────────┐
│  Discord   │ ◀──────▶│  ghost-empire-bot     │ ──HTTP─▶│ ghost-empire- │
│  Gateway   │ events  │  (this project)       │  bearer │ web /api/...  │
└────────────┘         └───────────────────────┘         └───────┬───────┘
                                                                 │
                                                          Prisma │
                                                                 ▼
                                                       ┌─────────────────┐
                                                       │  Supabase (PG)  │
                                                       └─────────────────┘
```

Bot NIE łączy się bezpośrednio z bazą. Wszystko leci przez `/api/internal/*` na webie.

## Co bot robi

| Event Discord | Akcja |
|---|---|
| `messageCreate` (zwykła wiadomość, nie bot, nie komenda) | `POST /api/internal/award` `{reason: "message"}` z cooldownem 60s per user |
| Tick co 60s | Lista userów na voice channels → award każdemu `{reason: "voice"}` |
| `/link KOD` (slash) | `POST /api/internal/link-discord` z `discordId` + username |
| `/portal` (slash) | Pokazuje link do portalu (ephemeral) |
| `/help` (slash) | Lista komend i info o ekonomii (ephemeral) |

## Setup

### 1. Konfig Discord Developer Portal

[discord.com/developers/applications](https://discord.com/developers/applications) → Twoja aplikacja:

- **Bot** → Privileged Gateway Intents:
  - ✅ `MESSAGE CONTENT INTENT` (bot musi widzieć treść wiadomości żeby filtrować pustki/komendy)
  - ✅ `SERVER MEMBERS INTENT` (do enumeracji członków voice)
  - `PRESENCE INTENT` nie potrzebny
- **OAuth2 → URL Generator**:
  - Scopes: `bot`, `applications.commands`
  - Bot Permissions: `Send Messages`, `Use Slash Commands`, `View Channels`, `Connect`, `Read Message History`
  - Skopiuj wygenerowany URL i zaproś bota na swój serwer

### 2. Install + run

```powershell
cd ghost-empire-bot
npm install
npm run dev
```

Bot powinien wypisać:
```
✅ Registered 3 slash commands for guild 1507027033778159808
✅ Bot online: gh0stempirebot#1234
   Guild: 1507027033778159808
   Web API: http://localhost:3000
   Rewards: msg=5GT/60s, voice=10GT/min
```

### 3. Test

1. **Voice**: Wejdź na dowolny voice channel → poczekaj 60s → na `/profile` masz +10 GT, quest "voice" zaczyna progresować.
2. **Messages**: Napisz wiadomość na text channel → +5 GT, ale max raz na 60s per user.
3. **/link**: Na portalu wygeneruj kod (TODO — endpoint już istnieje, UI do generowania można dodać). Wpisz na Discord `/link kod:XXXXXX` → bot łączy konto.

## Wymagane env vars

Patrz `.env.example`. Najważniejsze:

| Var | Co to |
|---|---|
| `DISCORD_BOT_TOKEN` | Z panelu Discord, **musi być pełen** token (nie client secret) |
| `DISCORD_CLIENT_ID` | Application ID z panelu Discord |
| `DISCORD_GUILD_ID` | ID Twojego serwera (Discord tryb dewelopera → PPM na serwer) |
| `WEB_API_URL` | Gdzie żyje `ghost-empire-web` (`http://localhost:3000` w dev) |
| `BOT_SECRET` | **MUSI** być identyczny z `BOT_SECRET` w `ghost-empire-web/.env` |

## Tunables

| Var | Default | Opis |
|---|---|---|
| `MESSAGE_REWARD` | 5 | Tokens za wiadomość |
| `MESSAGE_COOLDOWN_SECONDS` | 60 | Cooldown per user na wiadomość → token |
| `VOICE_REWARD_PER_MINUTE` | 10 | Tokens za minutę voice |
| `VOICE_TICK_SECONDS` | 60 | Co ile sekund sprawdzać kto na voice |
| `AFK_GIVES_REWARD` | false | Czy AFK channel daje nagrody |
| `MUTED_GIVES_REWARD` | true | Czy muteowani userzy dostają (słuchanie się liczy) |

Modyfikujesz w `.env` i restart bota.

## Anti-spam i edge cases

- **Cooldown messages**: 60s per user — spam farmer nie zarobi więcej niż 5 GT/60s = 300 GT/h
- **Skip empty messages**: `< 2 znaków` ignorowane (stickery, krótkie reakcje)
- **Skip komendy**: wiadomości zaczynające się od `!` lub `/` ignorowane (komendy botów)
- **Skip botów**: `msg.author.bot` filtered
- **Voice — AFK channel**: domyślnie nie daje nagród (`AFK_GIVES_REWARD=false`)
- **Voice — server-deafened**: nigdy nie dostają (nawet nie słyszą)
- **Voice — muted**: dostają domyślnie (słuchanie = aktywność)
- **In-memory cooldown**: resetuje się przy restarcie bota (akceptowalne — bot rzadko restartuje)

## Daily quest integration

Web API `/api/internal/award` automatycznie progresuje `UserTask` dla questów z `triggerType: "messages"` lub `"voice_minutes"` (patrz `ghost-empire-web/src/app/api/internal/award/route.ts`). Bot nie musi tego pamiętać.

## Linkowanie konta — pełen flow

1. User loguje się na portal `ghost-empire-web` przez Twitch
2. **TODO**: na `/profile` dodać button "Połącz Discord" który woła `PUT /api/internal/link-discord` żeby wygenerować kod (endpoint istnieje, brakuje tylko UI z buttonem)
3. User dostaje 6-znakowy kod (10 min ważności)
4. Na Discord wpisuje `/link kod:XXXXXX`
5. Bot wywołuje `POST /api/internal/link-discord` → web zapisuje `discordId` na User
6. Od tego momentu bot może awardować tokeny (web mapuje `discordId → userId`)

## Deployment options

### Opcja A: Lokalny PC (development / hobby)
```powershell
npm run dev   # tsx watch — auto restart przy zmianach
```

### Opcja B: PM2 (Linux/Mac/Windows server)
```bash
npm install -g pm2
npm run build
pm2 start dist/index.js --name ghost-bot
pm2 save && pm2 startup
```

### Opcja C: Railway / Render / Fly.io
1. Push do githa
2. Connect repo
3. Set env vars w panelu
4. Build command: `npm run build`
5. Start command: `npm start` (lub `node dist/index.js`)

### Opcja D: Docker
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
CMD ["node", "dist/index.js"]
```

## Troubleshooting

| Problem | Rozwiązanie |
|---|---|
| `Login failed: TokenInvalid` | Token bota jest zły lub został zrotowany. Wygeneruj nowy w Discord Dev Portal → Bot → Reset Token |
| `Used disallowed intents` | Włącz MESSAGE CONTENT + SERVER MEMBERS w Privileged Gateway Intents |
| Bot online ale nie reaguje na wiadomości | Sprawdź czy ma permission "View Channels" + "Read Message History" na kanale |
| `[api/award] 401 Unauthorized` | `BOT_SECRET` w bocie ≠ ten w webie. Skopiuj ten sam string do obu `.env` |
| `[api/award] network error` | `WEB_API_URL` nieosiągalny. Web running? Localhost vs production URL? |
| Slash commands nie pokazują się | Bot musi mieć scope `applications.commands` w invite URL. Wyrzuć z serwera i zaproś ponownie z poprawnym scope. |
