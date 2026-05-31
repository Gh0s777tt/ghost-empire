# Phase 3 — Streaming bot ecosystem (Twitch + Kick + YouTube)

**Status:** **Phase 3A (chat bot) + 3B (engagement) ZREALIZOWANE i na produkcji** (2026-05-30). Bot czatu na Twitch + Kick + YouTube żyje, komendy zarządzane z portalu, plus timery / FAQ / powitania / song requests / chat overlay. **Następny duży krok: 3C (alerts upgrade + hardware) i 3D (AI + analityka)** — pozostają planem poniżej.

> ### ✅ Już shipped z Phase 3
> - **Phase 3A — chat bot** (`ghost-empire-chat`) — bot na **Twitch + Kick + YouTube**, 1 GT/min/widz, komendy zarządzane z portalu (`/admin#chat`), auto-refresh tokenów. **DZIAŁA na produkcji** (PR #6–#8).
> - **Phase 3B — engagement** — **timery** (`#timers`), **FAQ / auto-odpowiedzi** (`#faq`), **powitania** (`#welcome`), **song requests** `!sr` (`#songs`), **chat overlay** OBS (`/overlay/chat`) — PR #9–#13. Plus wcześniejsze: **Stream Goals + Hype Train** (`/overlay/goals`).
> - **Predictions / Zakłady GT** (3D) — `/predictions`, pula dzielona proporcjonalnie do stawek, refund przy cancelu
> - **Battle Pass / Sezony** — 30 tierów × 5000 XP, XP z 11 źródeł, `/seasons` + sekcja admina
> - **Rozbudowa achievementów** — 53 odznaki, auto-grant engine wyzwalany zdarzeniami streamowymi
> - **Kick auto-events + YouTube super chaty** — domknięcie Phase 2 (patrz [PHASE2.md](PHASE2.md))
>
> ### 🚧 Następny duży krok: Phase 3C (alerts + hardware) → 3D (AI + analityka)
> **3A i 3B są zrobione.** Poniżej zostaje plan 3C / 3D; sekcje 3A/3B zostawione jako referencja i oznaczone ✅ DONE.

## TL;DR realistyczny zakres

Twoja oryginalna lista to ~12–18 miesięcy pracy full-time (porównywalne z budowaniem hybrydy StreamElements + Streamlabs Chatbot + Nightbot + Lumia Stream naraz). Dlatego dzielę to na **4 pod-fazy** i tieruje features od foundation do moonshot. **Każda pod-faza = 1–3 miesiące sesji.**

| Pod-faza | Co | Czas | Bez czego nie ma sensu iść dalej |
|---|---|---|---|
| **3A** | Bot foundation — chat na 3 platformach + dashboard + custom commands | ~3-6 sesji | konieczne — wszystko inne się o to opiera |
| **3B** | Engagement core — song requests, goals, welcome, scheduled msgs, FAQ, moderacja, daily quests bot-driven | ~5-8 sesji | opcjonalne ale to MVP "fajnego bota" |
| **3C** | Alerts upgrade + pierwsze hardware integracje (OBS WebSocket, Philips Hue, Govee) | ~4-6 sesji | nice-to-have |
| **3D** | AI features + zaawansowana analityka + Subathon | ~5-8 sesji | luxury |

Po Phase 3D zostaje "moonshot tier" — NFT, voice commands, TikTok auto-upload, integracje z 8+ konkretnymi markami sprzętu (każde to osobny SDK + miesiące). To DLA każdej z nich osobny projekt.

---

## Architektura — decyzje upfront

### Hosting bota — NIE Vercel

Vercel = serverless functions, max 10s execution. Bot streamingowy MUSI być długo żyjącym procesem (websocket do Twitch IRC, polling YouTube co 10s, websocket Kick). Opcje:

| Opcja | Plus | Minus | Cena |
|---|---|---|---|
| **Railway** (rekomendacja) | Łatwy deploy z gita, env vars w UI, $5 budget free | Hobby tier 500h/mc = ~21 dni 24/7 | ~$5/mc po przekroczeniu free |
| **Render** | Free tier, prosty | Sleep po 15 min nieaktywności (zły dla bota) | Free / $7 paid |
| **Fly.io** | Worldwide regions, dobre dla websocketów | Steeper learning curve | Free hobby + per-usage |
| **VPS** (Hetzner/DO) | Pełna kontrola, najtaniej długoterminowo | Sam musisz konfigurować | $4-6/mc |
| **Lokalny PC (jak Discord bot)** | $0 | PC musi być cały czas włączony | $0 + prąd |

**Rekomendacja:** Railway na start (pierwsze 6 mc free przez budget), później VPS jeśli rachunek przekroczy $10/mc.

### Repo layout

Obecnie: `ghost-empire-web/` + `ghost-empire-bot/` (Discord only).

Propozycja:
```
ghost-empire-phase1/
├── ghost-empire-web/        ← Next.js portal (Vercel) — bez zmian
├── ghost-empire-bot/        ← Discord bot (jak teraz) — bez zmian
└── ghost-empire-chat/       ← NOWY: bot Twitch+Kick+YT (Railway/VPS)
```

`ghost-empire-chat` to nowy mono-bot dla 3 platform streamingowych. Discord bot zostaje osobno (różne odpowiedzialności, różny gateway, różny runtime).

### Komunikacja chat-bot ↔ portal

Identyczny pattern jak Discord bot:
- chat-bot trzyma **shared BOT_SECRET**
- woła `POST /api/internal/award` żeby dawać tokeny
- woła `POST /api/internal/chat-event` (nowy endpoint) żeby logować zdarzenia + triggerować alerty
- subskrybuje konfigurację przez `GET /api/bot/chat-config` (analogicznie do istniejącego `/api/bot/config`)

### Komunikacja portal ↔ overlay OBS

Już istnieje (Stream Alerts). Reużywamy:
- DB-backed kolejka `StreamAlert`
- Polling co 1.2s z `/api/alerts/queue?token=...`
- Token rotowalny z `/admin#alerts`

Wszystkie nowe rzeczy (song request widget, stream goal bar, hype train pasek, kontent overlay'a) → identyczna konwencja: nowy DB model + token-gated polling endpoint + osobna page w `app/overlay/<feature>/page.tsx`.

---

## Audit — co JUŻ JEST i co JESZCZE BRAK z Phase 2

### Done ✅

| Feature | Status |
|---|---|
| Twitch OAuth + EventSub (subs/gifts/bits) | ✅ |
| Kick OAuth | ✅ |
| Google/YouTube OAuth | ✅ |
| Discord OAuth + Discord bot (msg/voice tracking) | ✅ |
| Streamlabs donacje (polling co 6h) | ✅ |
| Stream Alerts overlay (OBS Browser Source) + dispatch z 7 endpointów | ✅ |
| Admin panel z sidebar nav (17 sekcji) | ✅ |
| Stream Goals + Hype Train + overlay | ✅ |
| Predictions / zakłady GT | ✅ |
| Battle Pass / Sezony (30 tierów) | ✅ |
| 53 achievementy + auto-grant engine | ✅ |
| Kick webhooki + YouTube super chaty | ✅ |
| Account linking z poziomu profilu | ✅ |
| Admin merge tool dla duplikatów | ✅ |
| Social tiles na profilu (auto z OAuth) | ✅ |
| OVERLAY_TOKEN w DB + UI rotacji | ✅ |

### Wciąż brakuje konfiguracji ⚙️ (zależne od Ciebie)

| Co | Co zrobić |
|---|---|
| `OVERLAY_TOKEN` w Vercel envs (opcjonalne — jest fallback z DB) | Nie wymagane, można usunąć |
| YouTube Data API quota | Włącz w Google Cloud Console projekcie Ghost Empire (jeśli planujesz J — super chats) |
| Kick API beta-access | Czekamy na publiczne webhooks Kicka (nadal blocked) |

### Domknięte z PHASE2 ✅ (wcześniej ❌)

| # | Co | Status | Jak |
|---|---|---|---|
| I | Kick auto-events (subs, gifty, followy) | ✅ | Kick wydał webhooki → `/api/webhooks/kick-events` (RSA verify) |
| J | YouTube super chats / members | ✅ | polling `/api/yt/poll-live-chat` podczas live (cron-job.org) |

---

## Phase 3A — Bot foundation ✅ ZREALIZOWANE

> **✅ DONE (2026-05-30).** Bot działa na Twitch + Kick + YouTube, komendy zarządzane z portalu (`/admin#chat`) + GT/min. **Różnice względem planu poniżej:** bot chodzi na PC streamera (nie Railway — portable przez env vars, gotowy na host później); commands trzymane w modelu `ChatCommand` + `/admin#chat` (planowane niżej `PlatformBotAccount` / `ChatMessage` / `BotChatLog` NIE zostały zbudowane — tokeny per-platforma w `.env`, pełny log wiadomości pominięto na rzecz lekkiego `ChatFeedMessage` dla overlaya). Reszta tej sekcji = oryginalny plan (referencja).

**Cel:** bot żyje, łączy się z czatem 3 platform, ma podstawowy custom-command system + dashboard w `/admin`.

### Schema

```prisma
// Wspólne konto bota na każdej platformie
model PlatformBotAccount {
  id             String   @id @default("default")
  platform       String   // "twitch" | "kick" | "youtube"
  username       String
  accessToken    String   @db.Text
  refreshToken   String?  @db.Text
  tokenExpiresAt DateTime?
  connectedAt    DateTime @default(now())
  enabled        Boolean  @default(true)

  @@unique([platform])
  @@map("platform_bot_accounts")
}

// Custom commands (np. !discord → "join discord at ...")
model ChatCommand {
  id          String   @id @default(cuid())
  platform    String   // "twitch" | "kick" | "youtube" | "all"
  trigger     String   // "!discord" — case insensitive
  response    String   @db.Text
  enabled     Boolean  @default(true)
  cooldownSec Int      @default(5)
  permission  String   @default("everyone") // "everyone" | "subscriber" | "moderator" | "vip"
  uses        Int      @default(0)
  lastUsedAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([platform, trigger])
  @@map("chat_commands")
}

// Wszystkie wiadomości z platform — do analityki + heatmap (Phase 3D)
model ChatMessage {
  id           String   @id @default(cuid())
  platform     String
  platformMsgId String?
  authorLogin  String
  authorName   String?
  userId       String?  // matched Ghost Empire user
  message      String   @db.Text
  isCommand    Boolean  @default(false)
  isBot        Boolean  @default(false)
  receivedAt   DateTime @default(now())

  @@index([platform, receivedAt])
  @@index([userId])
  @@map("chat_messages")
}

// Logi co bot wysłał (response na komendy, scheduled msgs, etc.)
model BotChatLog {
  id          String   @id @default(cuid())
  platform    String
  trigger     String?  // command trigger lub "scheduled" / "auto_response"
  response    String   @db.Text
  sentAt      DateTime @default(now())

  @@index([platform, sentAt])
  @@map("bot_chat_logs")
}
```

### Bot kod (`ghost-empire-chat/`)

```
src/
├── index.ts              ← main, ładuje wszystkie platforms
├── config.ts             ← env + polling /api/bot/chat-config
├── platforms/
│   ├── twitch.ts         ← tmi.js (IRC) lub EventSub Chat (nowsze)
│   ├── kick.ts           ← @retconned/kick-js + websocket reverse
│   └── youtube.ts        ← polling liveChat.messages
├── handlers/
│   ├── command.ts        ← parsowanie wiadomości → match w DB → wyślij response
│   ├── chat-log.ts       ← zapis ChatMessage
│   └── points.ts         ← integracja z /api/internal/award (po N msgs)
└── api/
    └── web.ts            ← wrapper na /api/internal/* + /api/bot/chat-config
```

### Dashboard (`/admin#chat`)

Nowa sekcja sidebar z lucide icon `MessageSquare`. UI:

- **Status botów per platforma**: zielona/czerwona kropka, connected/disconnected, last seen
- **Custom Commands**: tabela z columns: trigger, platform, response, uses, edit/delete
- **Add command**: form (trigger, platform, response, permission, cooldown)
- **Recent chat log**: ostatnie 50 wiadomości z 3 platform (debugging)

### Endpointy

| Endpoint | Co |
|---|---|
| `GET /api/admin/chat-commands` | lista + filtry |
| `POST /api/admin/chat-commands` | create |
| `PATCH /api/admin/chat-commands/[id]` | update |
| `DELETE /api/admin/chat-commands/[id]` | delete |
| `GET /api/admin/chat-bot-status` | live status botów (last heartbeat per platforma) |
| `POST /api/internal/chat-event` | bot loguje wiadomość, dostaje listę komend do wykonania |
| `GET /api/bot/chat-config` | bot pobiera listę aktywnych komend + settings |

### Konfiguracja użytkownika (one-time)

- Założenie bot accountu na każdej platformie (np. `gh0stempirebot` na Twitch/Kick/YT)
- OAuth dla każdego bot accountu (osobny od streamer accountu) — chat write permissions
- Środowisko hosting (Railway): set env vars, deploy

---

## Phase 3B — Engagement core ✅ (rdzeń zrealizowany)

> **✅ DONE (2026-05-30):** timery (#1), FAQ auto-responses (#3), welcome system (#4), stream goals (#5), song requests (#6), chat overlay (#7) — wszystko na produkcji. **Zostaje:** conditional commands (#2 — częściowo: jest cooldown), dynamiczne daily questy z czatu (#8), pełne cross-platform unified points (#9 — działa GT/min, do dopięcia reszta źródeł).

**Cel:** bot przestaje być "tylko echo" i staje się platformą engagement'u.

### Sub-features

1. **Scheduled / Timer messages** ✅ **DONE** (PR #9, `/admin#timers`) — bot broadcastuje co X minut na 3 platformy, tylko gdy czat aktywny (anty-spam offline)
   - Zaimplementowane jako `ChatTimer { message, intervalSeconds, enabled }` + `broadcast.ts` (rejestr senderów + `recentlyActive`)
2. **Conditional commands** — np. `!uptime` działa tylko podczas live, `!socials` cap'ed do 1/h
   - Już w `ChatCommand` mamy `cooldownSec`, dodać `requiresLive`, `minViewers`, `activeFromMinute`
3. **FAQ auto-responses** ✅ **DONE** (PR #10, `/admin#faq`) — reakcja gdy wiadomość zawiera słowo kluczowe (tryb *zawiera* / *całe słowo* + cooldown)
   - Zaimplementowane jako `FaqResponse { keyword, matchType, response, cooldownSeconds }`; `matchFaq()` jako fallback po komendach
4. **Welcome system** ✅ **DONE** (PR #11, `/admin#welcome`) — bot wita pierwszą wiadomość widza w danej sesji (szablon `{user}`, pomija własne konto/streamera)
   - Zaimplementowane jako singleton `WelcomeConfig { enabled, template }` + per-sesja seen-set w bocie (bez bonusu tokenów na razie — można dorzucić)
5. **Stream goals** — DB-backed cele — ✅ **DONE**
   - Schema: `StreamGoal` (6 typów: subs/gift_subs/follows/donations_pln/cheers_bits/yt_members, 5 trybów resetu) + `HypeTrainState`
   - Overlay page `app/overlay/goals/page.tsx` z animowanym paskiem postępu + banner hype train
   - Hype Train = osobny tracker, auto-uruchamiany przez Twitch EventSub (`channel.hype_train.*`)
   - Admin `/admin#goals`: CRUD celów, color picker, ręczny ±1, reset, toggle
6. **Song Requests** ✅ **DONE** (PR #12, `/admin#songs`) — `!sr <link>` → kolejka z play/skip/clear (auto-refresh)
   - Zaimplementowane jako `SongRequest { query, requestedBy, platform, status }` + `/api/internal/song-request` (bot) + `/api/admin/song-requests`. *(Bez walidacji YouTube API / drag-reorder — można dorzucić.)*
   - Bot komenda: `!sr <youtube_url>` lub `!sr <search>`
   - YouTube API do walidacji URL + pobrania tytułu/długości
   - Overlay page `app/overlay/song-request/page.tsx` pokazujący CURRENT playing
   - Admin UI: kolejka z drag-reorder, skip, ban song/user
   - **Wymaga**: YouTube API key (już mamy)
7. **Chat overlay** ✅ **DONE** (PR #13, `/overlay/chat?token=`) — nakładka OBS łącząca czat z 3 platform, kolory per platforma
   - Zaimplementowane: bot `pushChatFeed()` → `/api/internal/chat-feed` → rolling buffer `ChatFeedMessage` → token-gated `/api/alerts/chat` → `app/overlay/chat/` (poll 2 s)
8. **Dynamic Daily Quests** — bot generuje questy oparte na chat activity
   - Schema rozszerzona o `triggerType: "chat_messages" | "song_request_play" | ...`
   - Generator: codziennie cron generuje 3 questy oparte na pulę templates
9. **Cross-platform unified points** — już prawie jest (Discord daje punkty), trzeba dorzucić chat msg z każdej platformy
   - Każdy `ChatMessage` z `userId` → `/api/internal/award { reason: "chat_msg_twitch", amount: 1 }` z cooldownem 60s per user

### Dashboard rozszerzenie

`/admin#chat` rozszerza się o sub-zakładki:
- Commands (z 3A)
- Timers & Scheduled
- FAQ Auto-responses
- Welcome System
- Stream Goals
- Song Requests
- Chat Overlay

---

## Phase 3C — Alerts upgrade + first hardware (~4-6 sesji)

**Cel:** alerty stają się bardziej cinematic, OBS przejmuje sterowanie scenami przez bota, pierwsze RGB integracje.

### Alerts customization (rozszerzenie istniejących Stream Alerts)

- Per-type customization (sekcja per: shop_purchase, twitch_sub, donation, etc.):
  - Animacja: slide-from-right (jak teraz) / fade / bounce / zoom
  - Czcionka: lista predefiniowanych (Inter, Anton, JetBrains Mono, Bebas Neue, Permanent Marker, etc.)
  - Custom emoji/grafika (upload do Cloudinary lub Vercel Blob)
  - Custom dźwięk (upload mp3, max 500kB, max 5s)
  - Rozmiar (S/M/L) i pozycja (4 corners + center)
  - Czas wyświetlania (już jest globalnie, dorzucić per-type override)
- Animowane gify dla custom grafik
- Per-amount thresholds dla donacji (np. >50 PLN → większy alert + dłuższy + inna animacja)

### OBS WebSocket integration

OBS od v28 ma wbudowany WebSocket server (port 4455). Klient: `obs-websocket-js`.

Bot lub web mogą:
- Przełączać sceny (`!scene gameplay` → switch scene w OBS)
- Pokazywać/ukrywać sources
- Triggerować "ekran chaos" przez kombinację: scene change + filter
- **Wymaga**: streamer włącza WebSocket w OBS Tools → WebSocket Server Settings + hasło → wkleja hasło w `/admin#obs`

### Donation effects (Twoja długa lista — VFX/audio/lighting)

Najprostsze podejście: każdy effect to "preset" z 3 dimensjami:
1. **Visual trigger** w OBS (toggle filter na konkretnym source, np. "shake camera", "invert colors", "VHS distortion") — implementacja w OBS jako wstawione filtry przed startem
2. **Audio trigger** (graj plik mp3) — w overlay, używa już istniejącego audio system
3. **Lighting trigger** (Philips Hue/Govee/Lumia API call)

Schema:
```prisma
model DonationEffect {
  id           String  @id @default(cuid())
  name         String  // "horror mode", "rainbow chaos"
  triggerType  String  // "donation_amount" | "command" | "manual"
  triggerValue Int?    // np. min 50 PLN
  enabled      Boolean @default(true)

  // OBS actions
  obsSceneChange String?     // switch scene
  obsFilterToggle String?    // "MainCam:Shake" — source:filter
  obsDurationMs Int?         // auto-revert after

  // Audio
  audioFileUrl String?

  // Lighting
  lightColor    String?      // "#ff0000"
  lightEffect   String?      // "pulse" | "strobe" | "solid"
  lightDurationMs Int?
}
```

### Philips Hue / Govee integration

**Philips Hue**:
- Streamer ma Hue Bridge w sieci lokalnej
- Bot/web NIE może łączyć się z Hue Bridge bezpośrednio (jest w sieci streamera, nie w internecie)
- Rozwiązanie A: **Hue Cloud API** (wymaga developer account, OAuth) — preferowane
- Rozwiązanie B: lokalny "ghost-empire-bridge" działający na PC streamera (Electron app albo systray)

**Govee**:
- Cloud API (developer.govee.com) — łatwiejsze, OAuth + REST
- Działa z internetu

**Lumia Stream**:
- Lumia ma swój API ale wymaga subskrypcji Lumia. Streamer już musi mieć Lumia żeby było sens integrować.
- Lumia API: REST, auth przez API key

**Razer Chroma / Corsair iCue / Logitech G HUB / SteelSeries / Elgato Control Center / Stream Deck**:
- Każde to OSOBNY native SDK, działa TYLKO lokalnie na PC streamera
- WYMAGA: lokalna aplikacja "ghost-empire-bridge" (Electron) instalowana przez streamera
- Każde SDK = osobny adapter, każdy adapter to projekt na tydzień
- Stream Deck ma najprzyjaźniejszy plugin SDK (Stream Deck plugins są JS-based)

**Phase 3C scope:** Tylko Philips Hue + Govee + ewentualnie Lumia Stream. Razer/Corsair/Logitech/SteelSeries/Elgato to osobna sub-faza wymagająca Electron-bridge — Phase 4.

---

## Phase 3D — AI features + analytics + Subathon (~5-8 sesji)

**Cel:** bot przestaje być reaktywny — przewiduje, wykrywa, sugeruje.

### AI features (każda osobny projekt)

**AI Moderator**:
- Każda wiadomość → Claude/GPT API z prompt: "is this toxic/spam? respond with JSON"
- Action: timeout / delete / nothing
- Cost: ~$0.0001 per message przy Haiku/GPT-4o-mini
- Quota: streamer ustawia max budget dzienny
- Wymaga: ANTHROPIC_API_KEY lub OPENAI_API_KEY env var

**AI Auto-responses (kontekstowe)**:
- Bot trzyma "current stream context" (ostatnie 5 min wiadomości + tytuł streama)
- Pytanie w czacie → AI generuje odpowiedź z kontekstem
- Confidence threshold — jeśli AI niepewne, nie odpowiada
- Cost: ~$0.001 per response

**AI Command suggestions**:
- Co X dni: analizuje top 100 wiadomości i sugeruje 3 nowe komendy
- Admin review przed wdrożeniem

**AI Auto-shoutouts**:
- Bot wykrywa raidów (Twitch raid event) → AI generuje shoutout z kontekstem (czyj kanał, co streamuje, ile widzów)

**AI Clip Detection**:
- Polling chat sentiment co 30s
- Spike emocji/śmiechu → flag → auto-clip via Twitch API
- Cost: znaczny — wymaga ML do sentiment analysis (lub LLM)

### Subathon / Goalathon — ✅ DONE (PR #17)

> Zrealizowane: model `Subathon` (singleton) + `lib/subathon.ts` (`extendSubathon`), przedłużanie z subów/giftów (Twitch+Kick) i donacji (Streamlabs+YouTube) wpięte obok `incrementGoals`, overlay `/overlay/subathon?token=` (drift-corrected countdown), panel `/admin#subathon` (start/stop/±czas/tempo/cap). Poniżej oryginalny plan.

- Wydłużenie streama za każdy sub/donacje
- Schema: `Subathon { id, startTime, currentEndTime, secondsPerSub, secondsPerDollar, active }`
- Overlay z countdown timerem
- Każdy sub/donacja przedłuża + alert na overlayu

### Analytics

**Per-stream stats**:
- Schema: `StreamSession { id, startedAt, endedAt, peakViewers, totalMsgs, totalTokensAwarded, ... }`
- Auto-trigger via Twitch EventSub `stream.online`/`stream.offline`
- Dashboard: lista streamów + drilldown

**A/B testing komend**:
- Komenda ma "variants" (różne response'y)
- Random per call
- Metrics: które przyciąga reakcje (response z chat po komendzie w ciągu 30s)

**Chat heatmapy**:
- `ChatMessage.receivedAt` grouped by 15-min bucket → wykres
- Dashboard widget pokazujący kiedy chat jest najbardziej aktywny

**Top earners / engagement**:
- Już mamy ranking. Dorzucić engagement score = msgCount * 1 + voiceMinutes * 0.5 + bits * 0.1 + ...

### Predictions / Bets — ✅ DONE

- Schema: `Prediction` (2-4 opcje, opcjonalny czas zamknięcia) + `PredictionEntry` (unique predictionId+userId)
- UI: admin tworzy w `/admin#predictions`, userzy obstawiają na `/predictions` (min 10, max 1M GT, jeden wager per user)
- Payout: wygrywająca opcja dzieli **całą pulę** proporcjonalnie do stawek; refund przy cancelu lub braku zwycięzców; wszystko atomowo w `$transaction` + audit log + notyfikacje
- *Zrealizowane wcześniej niż chat bot, bo nie wymaga długo-żyjącego procesu (czysta logika portalu).*

---

## Game library integration — analiza

Twoje pytanie: "czy jest możliwość połączenia z aplikacjami z grami...".

| Platforma | API | Co da się przeczytać | Łatwość |
|---|---|---|---|
| **Steam** | Steam Web API (z API key) | Lista gier usera publicznego, achievementy, czas grania | ★★★ easy (publiczne API, requires Steam ID) |
| **Xbox** | Xbox Live API (XAL) | Lista gier (jeśli profil publiczny), achievementy | ★★ medium (Microsoft OAuth) |
| **PSN** | nieoficjalny (np. psn-api npm) | Lista gier, trophies | ★ unreliable, łamie ToS PSN |
| **GOG** | brak public API | brak | nie da się |
| **Battle.net** | Blizzard API (OAuth) | Lista gier per produkt (WoW, OW, HotS) | ★★ medium |
| **Bethesda** | brak public API | brak | nie da się |
| **Roblox** | Roblox Web API | Tak | ★★★ easy |
| **Epic Games** | brak public API | brak (nieoficjalny `epic-games-public-api` istnieje ale łatwo blokowany) | unreliable |

**Realny scope dla Phase 3+:** Steam + Roblox (i opcjonalnie Xbox + Battle.net z OAuth). Reszta = nie da się legalnie/stabilnie.

**Voting widget**:
- UI w portalu: "Zagłosuj na następną grę"
- Lista pobrana z połączonych platform streamera
- Userzy głosują za tokeny (1 vote = X tokens)
- Top 3 wyłaniane przez voting

---

## Moonshot tier — Phase 4+ (poza tym dokumentem)

- NFT/kolekcjonerskie odznaki (wymaga blockchain wallet integration, ETH/Polygon, cena gazu)
- Voice commands (wymaga local mic listener — Electron app)
- TikTok / YouTube Shorts auto-upload (TikTok API ma restrykcje, YouTube wymaga manualnego konsentu per video)
- Razer/Corsair/Logitech/SteelSeries SDK (Electron bridge per SDK)
- Multi-platform unified chat (cross-platform message bridge — Twitch chat = Kick chat = YT chat live)
- Stream Deck plugin
- System rekomendacji AI ("co oglądać dalej")

---

## Realistyczna rekomendacja

**Start od Phase 3A**: 2 sesje na podstawową integrację Twitch chat + dashboard z custom commands. Wszystko inne się o to opiera, więc bez tego nie ma sensu iść dalej.

Po 3A:
- Wybieramy 2-3 najważniejsze features z 3B (np. Stream Goals + Welcome + Song Requests)
- Reszta wisi w roadmapie

3C i 3D — robimy gdy 3A+3B działa stabilnie 2-4 tygodnie na produkcji.

## Co potrzebujesz przygotować PRZED Phase 3A

1. **Bot accounts**:
   - Twitch: nowe konto `gh0stempirebot` (lub podobne) — OAuth z `chat:read` + `chat:edit`
   - Kick: jak wyżej (po zaakceptowaniu Twojej app w Kick beta)
   - YouTube: konto Google z dostępem moderatora do Twojego kanału + Data API access
2. **Hosting decyzja**: Railway (rekomendacja) vs VPS — bot musi działać 24/7
3. **Decyzja Phase 3B priorities**: które 2-3 features ważne najbardziej

Gdy te 3 rzeczy są gotowe → kodujemy 3A.
