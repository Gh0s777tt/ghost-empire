# 🏗️ ARCHITECTURE.md — jak to działa

Przegląd architektury ekosystemu Ghost Empire: 3 pakiety, jeden wspólny model ekonomii Ghost Tokens (GT) spinający Twitch / Kick / YouTube / Discord.

---

## 1. Pakiety (monorepo)

| Pakiet | Co to | Stack | Hosting |
|---|---|---|---|
| **`ghost-empire-web`** | Portal + API + panel admina + overlaye OBS | Next.js 15 (App Router), React 18, Prisma 5, NextAuth v4, Tailwind | Vercel |
| **`ghost-empire-chat`** | Bot czatu na żywo (Twitch + Kick + YouTube) | Node + `tsx` (tmi.js / Pusher WS / YouTube polling) | Docker / VPS 24/7 |
| **`ghost-empire-bot`** | Bot Discord (nagrody za wiadomości/voice) | Node (discord.js) | VPS / kontener |

Baza danych: **PostgreSQL (Supabase)**, jeden schemat dla portalu. Boty **nie** łączą się z bazą bezpośrednio — rozmawiają z portalem przez HTTP API (`BOT_SECRET`).

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

Czysta matematyka ekonomii (payouty predykcji, tier battle passa, konwersja walut, **perki poziomu i prestiżu** — `levelGtMultiplier` / `prestigeFromXp` / `prestigeGtMultiplier` / `discountedPrice`) żyje w `lib/economy.ts` (testowana, bez DB).

---

## 3. Tożsamość i konta

- **NextAuth v4** (strategia *database*) — login przez Twitch / Discord / Google(→YouTube) / Kick.
- Jeden `User` może mieć wiele `Connection` (po jednej na platformę). Łączenie kont: signed-cookie „link intent" w callbacku `signIn` (`lib/account-linking.ts`).
- **Role:** `isAdmin` / `isModerator` (+ `modPermissions[]`) / `isDonator`. Admin po: fladze w DB, `ADMIN_DISCORD_ID`, lub **stałym mailu** (`isPermanentAdminEmail` w `auth.ts` — przeżywa reset bazy). Uprawnienia moda: [PERMISSIONS.md](../PERMISSIONS.md).
- Prywatność: login Google nie wycieka imienia (fallback do local-part maila).

---

## 4. Overlaye OBS (Browser Source)

Wzorzec: strona `/overlay/<x>` (transparentna, `pointer-events:none`) **odpytuje** token-gated `/api/alerts/<x>?token=` (polling, bo Vercel Hobby = brak websocketów).

| Overlay | Feed | Treść |
|---|---|---|
| `/overlay` | `/api/alerts/queue` | Alerty (zakupy, suby, donacje…) |
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
- **YouTube** — auto-wykrycie live (`liveBroadcasts.list mine=true`) → polling `liveChat/messages`.
- Konfiguracja (komendy / timery / FAQ / powitania / nagrody / **moderacja**) pobierana z portalu (`/api/bot/*`, cache ~2 min) — bez restartu przy zmianach z panelu.
- Każda wiadomość: `markActivity` → **automod** (`moderation.ts` → delete/timeout/warn, pomija sub/VIP/mod) → `@bot`/`!imagine` → gry GT (`!slots`/`!coinflip`) / pojedynki PvP (`!duel`/`!accept`) / napad (`!heist`) → `!sr` → komenda/FAQ → powitanie → GT (`/api/internal/chat-award`) → feed do overlaya czatu (+ emotki/odznaki) → `emojiCombo.ts` (detekcja kombosów).
- **Auto-pin zakładów** (`betAnnounce.ts`): bot przypomina o otwartym zakładzie co 5 min na czacie (Twitch/Kick brak API pin → emulacja). Detektory automoda są **lustrem** `web/src/lib/moderation.ts`.
- ⚠️ **Egzekucja moderacji wymaga, by konto bota było moderatorem** na danej platformie. Zmiany w bocie → **restart** (`npm start` / Docker).

---

## 7. Jakość i deploy

- **CI** (GitHub Actions): job `quality` = `tsc --noEmit` + `eslint` + `vitest run` + `npm audit` (nieblokujący); job `integration · postgres` = `vitest run` przeciw **realnemu Postgresowi** (service container) na ścieżkach money-critical. Testy: czysta logika w `src/lib/__tests__` (111 unit) + integracyjne w `tests/integration` (11, real DB).
- **Workflow zmian (żelazna zasada):** branch → edycja → typecheck/lint/test (+ `db push` przy zmianie schematu) → PR → squash-merge. **Dokumentacja (CHANGELOG · README · ROADMAP · PLAN · PHASE · docs/* · on-site `/about`) jest aktualizowana w TYM SAMYM PR co zmiana** — nigdy nie zostaje w tyle.
- **Schemat:** Prisma `db push` (bez plików migracji) na Supabase; `prisma generate` regeneruje klienta.
- Build (`next build`) po stronie Vercela (preview deploy na każdym pushu).

---

## 8. Dokąd dalej

Plany i pomysły: [ROADMAP.md](../ROADMAP.md). Co zrobione: [CHANGELOG.md](../CHANGELOG.md). Zmienne: [ENV.md](ENV.md). API: [ENDPOINTS.md](ENDPOINTS.md). Uprawnienia: [PERMISSIONS.md](../PERMISSIONS.md). Fazy: [PHASE2.md](../PHASE2.md) / [PHASE3.md](../PHASE3.md).
