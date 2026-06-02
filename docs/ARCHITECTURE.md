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

Czysta matematyka ekonomii (payouty predykcji, tier battle passa, konwersja walut) żyje w `lib/economy.ts` (testowana, bez DB).

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
| `/overlay/subathon` | `/api/alerts/subathon` | Odliczanie (drift-corrected) |
| `/overlay/codes` | `/api/codes/current` | Rotacja drop-kodów |

Jeden wspólny `OVERLAY_TOKEN` (auto-generowany w bazie, rotowalny w `/admin#alerts`). Komponenty prezentacyjne (`AlertCard`, `GoalBar`, `SubathonCard`, `ChatMessageRow`, `CodeCard`) są **współdzielone** przez overlay i podglądy w panelu → podgląd = realny wygląd.

---

## 5. Panel admina (`/admin`)

Jeden duży klient (`components/admin/AdminClient.tsx`) z nawigacją sekcji. Dane ładowane **leniwie per sekcja** przez `/api/admin/section-data?s=<sekcja>` (Dashboard renderowany serwerowo). Mutacje → dedykowane endpointy `/api/admin/*`. Każda wrażliwa akcja → wpis w **audit logu** (`AdminAction`, `lib/audit.ts`) z nickiem admina i obiektu.

---

## 6. Bot czatu (`ghost-empire-chat`)

- **Twitch** — tmi.js (IRC), odpowiedzi przez OAuth bota.
- **Kick** — odczyt przez publiczny **Pusher WebSocket**, odpowiedzi przez oficjalne API (OAuth 2.1 + PKCE, refresh rotowany).
- **YouTube** — auto-wykrycie live (`liveBroadcasts.list mine=true`) → polling `liveChat/messages`.
- Konfiguracja (komendy / timery / FAQ / powitania / nagrody) pobierana z portalu (`/api/bot/*`, cache ~2 min) — bez restartu przy zmianach z panelu.
- Każda wiadomość: `markActivity` → komenda/`!sr`/FAQ → powitanie → GT (`/api/internal/chat-award`) → feed do overlaya czatu.

---

## 7. Jakość i deploy

- **CI** (GitHub Actions): `tsc --noEmit` + `next lint` + `vitest run` na każdy push/PR. Testy: czysta logika w `src/lib/__tests__`.
- **Workflow zmian:** branch → edycja → typecheck/lint/test (+ `db push` przy zmianie schematu) → PR → squash-merge. Docelowo: aktualizacja docs/CHANGELOG/ROADMAP + on-site changelog (`/about`) razem ze zmianą.
- **Schemat:** Prisma `db push` (bez plików migracji) na Supabase; `prisma generate` regeneruje klienta.
- Build (`next build`) po stronie Vercela (preview deploy na każdym pushu).

---

## 8. Dokąd dalej

Plany i pomysły: [ROADMAP.md](../ROADMAP.md). Co zrobione: [CHANGELOG.md](../CHANGELOG.md). Zmienne: [ENV.md](ENV.md). API: [ENDPOINTS.md](ENDPOINTS.md). Uprawnienia: [PERMISSIONS.md](../PERMISSIONS.md). Fazy: [PHASE2.md](../PHASE2.md) / [PHASE3.md](../PHASE3.md).
