# 🏗️ ARCHITECTURE.md — jak to działa

Przegląd architektury ekosystemu Ghost Empire: 3 pakiety, jeden wspólny model ekonomii Ghost Tokens (GT) spinający Twitch / Kick / YouTube / Discord.

---

## 1. Pakiety (monorepo)

| Pakiet | Co to | Stack | Hosting |
|---|---|---|---|
| **`ghost-empire-web`** | Portal + API + panel admina + overlaye OBS | Next.js 16 (App Router), React 19, Prisma 7, Auth.js v5 (next-auth 5), Tailwind 4 | Vercel |
| **`ghost-empire-chat`** | Bot czatu na żywo (Twitch + Kick + YouTube + Rumble) | Node + `tsx` (tmi.js / Pusher WS / YouTube polling) | Docker / VPS 24/7 |
| **E-Bot** (osobne repo `Gh0s777tt/E-Bot`) | Bot Discord — ekonomia GT (wiadomości/voice) + linkowanie kont. **Zastępuje `ghost-empire-bot`** | Node (discord.js v14, natywne `.mts`) | lokalnie / VPS |
| ~~`ghost-empire-bot`~~ *(deprecated)* | Dawny bot Discord w monorepo — **wyłączony**, przejęty przez E-Bot. Katalog zostaje jako referencja | Node (discord.js) | — |

Baza danych: **PostgreSQL (Supabase)**, jeden schemat dla portalu. Boty **nie** łączą się z bazą bezpośrednio — rozmawiają z portalem przez HTTP API (`BOT_SECRET`). **Podział ról:** `ghost-empire-chat` = streaming (Twitch/Kick/YT/Rumble), **E-Bot** = Discord + społeczność.

---

## 2. Rdzeń: ekonomia Ghost Tokens

Każda aktywność → GT. Źródła i przepływ:

```
Discord (wiadomości/voice) ─┐
Czat Twitch/Kick/YT ────────┤→ bot → POST /api/internal/(chat-)award (BOT_SECRET)
                            │
Suby/gifty/bity (Twitch) ───┤→ webhook /api/webhooks/twitch-eventsub (HMAC)
Suby/gifty (Kick) ──────────┤→ webhook /api/webhooks/kick-events
Super chaty/membery (YT) ───┤→ /api/yt/poll-live-chat (polling)
Donacje (Streamlabs) ───────┤→ cron /api/cron/streamlabs-poll  (PayMedia → webhook)
                            ↓
                      User.tokens (+ Transaction log)
                            ↓
        wydatki: sklep, predykcje, raffle  ·  progresja: XP/level, Battle Pass, osiągnięcia, streak, daily questy
```

> Gałąź „Discord (wiadomości/voice)" obsługuje teraz **E-Bot** (osobne repo) — woła `POST /api/internal/award` (`BOT_SECRET`), tak samo jak robił to dawny `ghost-empire-bot`. Endpointy portalu są niezmienione; zmienił się tylko bot wołający.

Czysta matematyka ekonomii (payouty predykcji, tier battle passa, konwersja walut, **perki poziomu i prestiżu** — `levelGtMultiplier` / `prestigeFromXp` / `prestigeGtMultiplier` / `discountedPrice`) żyje w `lib/economy.ts` (testowana, bez DB).

---

## 3. Tożsamość i konta

- **Auth.js v5** (next-auth 5, strategia *database*) — login przez Twitch / Discord / Google(→YouTube) / Kick.
- Jeden `User` może mieć wiele `Connection` (po jednej na platformę). Łączenie kont: signed-cookie „link intent" w callbacku `signIn` (`lib/account-linking.ts`).
- **Role:** `isAdmin` / `isModerator` (+ `modPermissions[]`) / `isDonator`. Admin po: fladze w DB, `ADMIN_DISCORD_ID`, lub **stałym mailu** (`isPermanentAdminEmail` w `auth.ts` — przeżywa reset bazy). Uprawnienia moda: [PERMISSIONS.md](../PERMISSIONS.md).
- Prywatność: login Google nie wycieka imienia (fallback do local-part maila).

---

## 4. Overlaye OBS (Browser Source)

Wzorzec: strona `/overlay/<x>` (transparentna, `pointer-events:none`) pobiera dane token-gated **realtime przez SSE** z automatycznym **fallbackiem do pollingu** (zero ryzyka na wizji). Alerty mają dedykowany strumień `/api/alerts/stream`; pozostałe overlaye idą przez **generyczny** `/api/overlay/stream/[feed]`. Oba transporty (push i fallback `/api/alerts/<x>`) dzielą producery payloadu (`lib/overlay-feeds`, alerty: `lib/alert-feed`) → identyczne dane niezależnie od transportu. Klient: hook `lib/use-overlay-stream` (SSE→polling), serwer: wspólny `sseStreamResponse()` (`lib/sse`). *(Wyjątek: `/overlay/codes` wciąż polling.)*

| Overlay | Feed | Treść |
|---|---|---|
| `/overlay` | `/api/alerts/stream` (SSE) → `/api/alerts/queue` (fallback) | Alerty (zakupy, suby, donacje…) |
| `/overlay/goals` | `/api/alerts/goals` | Stream Goals + Hype Train |
| `/overlay/chat` | `/api/alerts/chat` | Czat z 3 platform |
| `/overlay/subathon` | `/api/alerts/subathon` | Odliczanie (drift-corrected) + kolor/napis |
| `/overlay/codes` | `/api/codes/current` | Rotacja drop-kodów |
| `/overlay/predictions` · `/overlay/polls` | `/api/alerts/predictions` · `/api/alerts/polls` | Aktywny zakład / ankieta + kolor |
| `/overlay/last-event?kind=` | `/api/alerts/recent-events` | Ostatni sub / donator / follower |
| `/overlay/viewers` | `/api/alerts/viewers` | Liczba widzów (Twitch Helix) |
| `/overlay/widget?id=` | `/api/alerts/widget` | Własny widget z generatora (tekst/kolor/font/gradient) |
| `/overlay/emoji-combo` | `/api/alerts/emoji-combo` | Wybuch „×N COMBO" przy spamie emoji |
| `/overlay/wheel` | `/api/alerts/wheel` | Koło Fortuny — animacja zakręcenia + zwycięzca |

Jeden wspólny `OVERLAY_TOKEN` (auto-generowany w bazie, rotowalny w `/admin#alerts`). Trasy `/overlay/*` dostają nagłówki `noindex`/`no-store`. Komponenty prezentacyjne (`AlertCard`, `GoalBar`, `SubathonCard`, `ChatMessageRow`, `CodeCard`, `PredictionOverlayCard`, `PollOverlayCard`, `LastEventCard`, `CustomWidgetCard`, `WheelGraphic`) są **współdzielone** przez overlay i podglądy w panelu (w tym **biblioteka widgetów** `/admin#widgets`) → podgląd = realny wygląd. Czat overlay renderuje **prawdziwe odznaki Twitcha + emotki 7TV/BTTV/FFZ** (`lib/chat-assets.ts`, cache, `/api/chat/assets`).

> **🔐 Sekrety at-rest:** klucze API (`IntegrationConfig`) i tokeny OAuth/streamer (`Connection`, `TwitchStreamerToken`, `KickStreamerToken`, `YouTubeStreamerToken`, `StreamlabsConnection`) są szyfrowane AES-256-GCM przez `lib/crypto.ts` (klucz z `ENCRYPTION_KEY`/`NEXTAUTH_SECRET`). Odczyt deszyfruje transparentnie; legacy plaintext działa i szyfruje się przy następnym zapisie.

---

## 5. Panel admina (`/admin`)

Jeden duży klient (`components/admin/AdminClient.tsx`) z nawigacją sekcji. Dane ładowane **leniwie per sekcja** przez `/api/admin/section-data?s=<sekcja>` (Dashboard renderowany serwerowo). Mutacje → dedykowane endpointy `/api/admin/*`. Każda wrażliwa akcja → wpis w **audit logu** (`AdminAction`, `lib/audit.ts`) z nickiem admina i obiektu.

---

## 6. Bot czatu (`ghost-empire-chat`)

- **Twitch** — tmi.js (IRC), odpowiedzi przez OAuth bota.
- **Kick** — odczyt przez publiczny **Pusher WebSocket**, odpowiedzi przez oficjalne API (OAuth 2.1 + PKCE, refresh rotowany).
- **YouTube** — auto-wykrycie live (`liveBroadcasts.list?broadcastStatus=active` — **bez** `mine=true`: te filtry się wykluczają i `mine` daje 400 `incompatibleParameters`; `broadcastStatus=active` już zawęża do kanału zalogowanego konta) → polling `liveChat/messages`.
- Konfiguracja (komendy / timery / FAQ / powitania / nagrody / **moderacja**) pobierana z portalu (`/api/bot/*`, cache ~2 min) — bez restartu przy zmianach z panelu.
- Każda wiadomość: `markActivity` → **automod** (`moderation.ts` → delete/timeout/warn, pomija sub/VIP/mod) → `@bot`/`!imagine` → gry GT (`!slots`/`!coinflip`) / pojedynki PvP (`!duel`/`!accept`) / napad (`!heist`) → `!sr` → komenda/FAQ → powitanie → GT (`/api/internal/chat-award`) → feed do overlaya czatu (+ emotki/odznaki) → `emojiCombo.ts` (detekcja kombosów).
- **Auto-pin zakładów** (`betAnnounce.ts`): bot przypomina o otwartym zakładzie co 5 min na czacie (Twitch/Kick brak API pin → emulacja). Detektory automoda są **lustrem** `web/src/lib/moderation.ts`.
- ⚠️ **Egzekucja moderacji wymaga, by konto bota było moderatorem** na danej platformie. Zmiany w bocie → **restart** (`npm start` / Docker).

---

## 7. Multi-tenant SaaS (white-label)

Portal jest **multi-tenant** — z jednej instancji obsługuje wiele niezależnych „portali" (tenantów), każdy pod własną subdomeną i brandingiem. Founder GHOST77 to po prostu tenant domyślny (plan `elite` bezterminowo), więc istniejący portal działa bez zmian.

- **Host-routing:** edge-proxy (`middleware`) czyta `Host`, wyłuskuje slug z subdomeny (`<slug>.ROOT_DOMAIN`) przez `resolveTenantSlug` (`lib/tenant-host.ts` — czysta funkcja, bez Prisma, bezpieczna na edge) i przekazuje go nagłówkiem `x-tenant-slug`. **Rozwiązanie tenanta jest WYŁĄCZNIE z `Host`** — nagłówek jest forge'owalny (trasy `/api/*` omijają proxy), więc serwer mu nie ufa do resolucji; proxy go nadto strippuje i ustawia od nowa (defense-in-depth). Apex / `www` / nieznany host / brak `NEXT_PUBLIC_ROOT_DOMAIN` → tenant domyślny.
- **Izolacja danych:** modele user-owned mają `tenantId`; zapytania scope'owane przez `currentTenantId()` (`lib/tenant.ts`), tak że ranking, kasyno, ekonomia itd. nigdy nie mieszają danych między tenantami. Migracja istniejących rekordów: `/api/admin/backfill-tenant`.
- **Plany i bramki:** trzy plany (drabina Botrix-style) — **basic** (rdzeń społeczności: ekonomia/sklep/ranking/eventy/questy) → **pro** (+ kasyno, koło, predykcje, overlaye, subathon, kolejka utworów) → **elite** (+ AI-asystent/persona bota, webhooki wychodzące, custom branding). Wygasły plan płatny **degraduje się do basic** (społeczność działa dalej, premium pauzuje). Bramka request-time: `requireTenantFeature(f)` / `featureGateResponse(f)` (`lib/entitlements.ts`) → 403; przy awarii DB **fail-open** (billing nigdy nie kładzie portalu).
- **Branding per tenant:** nazwa/skrót/kolor/logo/nazwa+symbol tokenu/owner-handle z modelu `Tenant`; kolor marki idzie do CSS-var `--brand-rgb` (`hexToRgbTriplet`), OG-image generowany per tenant (`/api/og`).
- **Onboarding + billing (dry-wired):** zakładanie portalu przez `/api/onboarding` (+ `/my` do edycji), płatności przez Stripe (`lib/billing.ts`) — checkout `/api/billing/checkout`, webhook `/api/webhooks/stripe`. Provisioning/zarządzanie tenantami = **właściciel platformy** (`requirePlatformOwner`, `/api/admin/tenants`). Bez sekretów Stripe (`STRIPE_*`) i `NEXT_PUBLIC_ROOT_DOMAIN` całość jest no-opem (trial bez karty, jeden tenant) — aktywacja **bez zmian w kodzie**.
- **Overlaye + bot per tenant:** token overlaya i instancje bota są per tenant, więc każdy portal ma własne źródła OBS i własnego bota czatu.

---

## 8. Jakość i deploy

- **CI** (GitHub Actions): job `quality` = `tsc --noEmit` + `eslint` + `vitest run` + `npm audit` (nieblokujący); job `integration · postgres` = `vitest run` przeciw **realnemu Postgresowi** (service container) na ścieżkach money-critical. Testy: czysta logika w `src/lib/__tests__` (449 unit, 59 plików) + integracyjne w `tests/integration` (11, real DB).
- **Workflow zmian (żelazna zasada):** branch → edycja → typecheck/lint/test (+ `db push` przy zmianie schematu) → PR → squash-merge. **Dokumentacja (CHANGELOG · README · ROADMAP · PLAN · PHASE · docs/* · on-site `/about`) jest aktualizowana w TYM SAMYM PR co zmiana** — nigdy nie zostaje w tyle.
- **Schemat:** Prisma `db push` (bez plików migracji) na Supabase; `prisma generate` regeneruje klienta.
- Build (`next build`) po stronie Vercela (preview deploy na każdym pushu).

---

## 9. Model danych — wybrane / najnowsze modele

Schemat (`prisma/schema.prisma`) ma **~94 modele**; pełna prawda jest w pliku. Poniżej najnowsze/istotne grupy dodane w fali „donatr.ee + marketplace + społeczność" — wszystkie z nullable `tenantId` i odczytami scope'owanymi per portal (§7):

- **Karty + marketplace P2P:** `Collectible` / `UserCollectible` (katalog kart + kolekcja, paczki za GT, #551), `CardListing` (listingi P2P z escrow + 5% fee spalane, #552).
- **Overlay + alerty:** `OverlayScene` (sceny wielowidżetowe → jedno źródło OBS, #550), `StreamAlertSettings` (ustawienia + auto-token overlaya, **per tenant 1:1**), `AlertTypeConfig` (styl/próg per typ alertu).
- **Wsparcie / sponsorzy:** `PaymentMethod` (metody napiwków na `/support`, #514), `SupportGoal` (cel zbiórki, #519), `Sponsor` (partnerzy/loga, #538).
- **Auth + powiadomienia:** `Passkey` (WebAuthn, #543/#544), `PushSubscription` (web push, #533), `TwitchEvent` (dedup/idempotencja EventSub po `eventId`).
- **Zaangażowanie / społeczność:** `Companion` (Ghost Companion, xp), `Clan` + `ClanWar` (klany + wojny, #477), `ClipVote` (klip tygodnia, #502), `TriviaQuestion` / `TriviaAnswer` (#523), `SoundReward` (GT→dźwięki, #505), `DailyTask` / `UserTask` (questy), `StreamSession` (analityka „czas na streamie").
- **SaaS:** `Tenant` (portal: branding/plan/owner-handle; founder = tenant domyślny).

> Indeksy: hot-pathy tenant-scoped mają composite indexy (`[tenantId, …]`) dobrane pod realne zapytania (rankingi klanów/companionów, alerty wg typu, kolekcja); `Transaction.externalId @unique` służy idempotencji (donacje + daily-bonus). Zmiana schematu = additive `prisma db push` (bez plików migracji).

---

## 10. Dokąd dalej

Plany i pomysły: [ROADMAP.md](../ROADMAP.md). Co zrobione: [CHANGELOG.md](../CHANGELOG.md). Zmienne: [ENV.md](ENV.md). API: [ENDPOINTS.md](ENDPOINTS.md). Podsystemy (kasyno/odds, marketplace, crony, rate-limit): [SUBSYSTEMS.md](SUBSYSTEMS.md). Bezpieczeństwo: [SECURITY.md](../SECURITY.md). Uprawnienia: [PERMISSIONS.md](../PERMISSIONS.md). Fazy: [PHASE2.md](../PHASE2.md) / [PHASE3.md](../PHASE3.md).
