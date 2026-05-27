# Ghost Empire

Community portal + ekosystem botów dla streamera **Gh0s77tt** (Twitch/Kick/Discord/YouTube) z tokenową ekonomią, eventami, alertami OBS i auto-tracking aktywności.

🌐 **Production:** https://ghost-empire-web.vercel.app
📺 **Streams:** [twitch.tv/gh0s77tt](https://twitch.tv/gh0s77tt) · [kick.com/Gh0s77tt](https://kick.com/Gh0s77tt) · [youtube.com/@Gh0s77tt](https://www.youtube.com/@Gh0s77tt)

---

## Co to jest

Portal Next.js + bot Discord, w którym widzowie zarabiają **Ghost Tokens** (GT) za aktywność (Discord chat, voice, Twitch subs/bits/donejty, drop codes, daily questy) i wymieniają je w sklepie na cyfrowe + fizyczne nagrody. Admin steruje całością przez `/admin` (kategorie w sidebarze) — sklep, eventy, losowania, donacje, role moderatorów, alerty OBS, merge duplikatów kont.

## Monorepo layout

```
ghost-empire-phase1/
├── ghost-empire-web/        ← Next.js 15 portal (Vercel deploy)
├── ghost-empire-bot/        ← Discord bot (Node + discord.js) — Railway/VPS/local
└── ghost-empire-chat/       ← [PLANNED Phase 3] Twitch/Kick/YouTube chat bot
```

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router), React 18, Tailwind, Lucide icons, next/font |
| Backend | Next.js API routes, Prisma ORM, PostgreSQL (Supabase) |
| Auth | NextAuth v4 + PrismaAdapter, 4 OAuth providers (Twitch/Discord/Google/Kick) |
| Bot | discord.js 14, TypeScript, tsx |
| Deploy | Vercel (web) + lokalny/Railway (bot) |

## Aktualne features (Phase 2 — zrealizowane)

### Dla widzów
- **Logowanie** przez Twitch / Kick / Discord / Google (linkable — wszystkie na jednym koncie z poziomu `/profile`)
- **Ghost Tokens** za aktywność: Discord msg/voice, Twitch sub/bits/gift, drop codes, daily questy, donacje (Streamlabs)
- **Sklep** (`/shop`) — 12 itemów w 5 kategoriach, z requirementami (level, sub tier, dual platform)
- **Eventy** (`/events`) — giveaway, raffle z biletami, contest, happy hour
- **Ranking** (`/ranking`) — 4 metryki + podium + quick-actions modal dla adminów
- **Profil** (`/profile`) — achievementy (22), level/XP, transakcje, social linki (tile UI z auto-OAuth), połączone platformy
- **Daily quests** (`/quests`) — 3 dziennie, claim rewards
- **Drops codes** (`/drops`) — kody wpisywane podczas streama, pierwsze N osób = bonus
- **Achievementy** (`/achievements`) — galeria z filtrami i progressem
- **Public profile** (`/u/[username]`) — read-only profil dla każdego

### Dla streamera/adminów
- **Admin panel** (`/admin`) z sidebar nawigacją (11 sekcji):
  - **Dashboard** — skróty + statystyki + pending orders
  - **Użytkownicy** — grant tokenów, role userów, role per-platform
  - **Merge duplikatów** — wykrywa i scala stare zduplikowane konta
  - **Eventy** — tworzenie, edycja, losowanie zwycięzców
  - **Sklep** — manage items, dostarczanie zakupów
  - **Drops** — tworzenie kodów, statystyki claim
  - **Harmonogram** — slot'y streamu
  - **Bot Discord** — live config rewards/cooldowns (bez restart bota)
  - **Donacje** — Streamlabs connection + unmatched donations
  - **Twitch** — EventSub subskrypcje + log eventów (subs/gifts/bits)
  - **Stream Alerts** — overlay OBS, token rotacja, customization
  - **Audit log** — full historia akcji adminów

### Automatyzacja
- **Twitch EventSub** — auto-tracking subs / gifted subs / cheers, mapowanie na GT
- **Streamlabs polling** — daily cron sprawdza nowe donacje (Vercel Hobby plan limit)
- **Stream Alerts overlay** — Browser Source dla OBS, polling 1.2s, syntezowany chime, slide-in animacja
- **Discord bot** — tracking message + voice activity, slash commands (/link, /portal, /help)

### Bezpieczeństwo
- HSTS, X-Frame-Options, CSP, Permissions-Policy headers
- Rate limiting na wszystkich publicznych + internal endpointach (DB-backed sliding window)
- Bot endpoints: per-user + per-IP rate limits + amount caps (defense-in-depth)
- Audit log każdej akcji admina (`admin_actions` z IP)
- Cryptographic randomness dla kodów drops i losowań eventów
- Session-based auth z fresh DB read (nie ufa cookie)
- Atomic transactions dla każdej mutacji ekonomicznej (Prisma `$transaction`)
- HMAC-signed cookies dla account linking flow

---

## Setup od zera

### Wymagania
- Node 22+
- PostgreSQL — najprościej **Supabase** (free tier wystarczy na start)
- Konto na Vercel (web hosting)
- Konta developera: Twitch, Discord, Google Cloud, Kick (beta), Streamlabs (opcjonalnie)

### Web

```powershell
cd ghost-empire-web
cp .env.example .env.local
# Wypełnij wymagane env vars — patrz .env.example dla każdego providera
npm install
npm run db:push     # schema → Supabase
npm run db:seed     # achievementy, daily tasks, shop items, events
npm run dev         # → http://localhost:3000
```

### Bot Discord

```powershell
cd ghost-empire-bot
cp .env.example .env
# Wypełnij DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, BOT_SECRET (musi = web BOT_SECRET)
npm install
npm run dev
```

Bot integracja: szczegóły w [`ghost-empire-bot/README.md`](ghost-empire-bot/README.md).

### Vercel deploy
1. Push do GitHub
2. Vercel auto-deploy z main
3. Env vars w Project Settings → Environment Variables (kopiuj z `.env.example`)
4. Każdy nowy provider OAuth → dodaj URL callback do panel providera (np. `https://ghost-empire-web.vercel.app/api/auth/callback/twitch`)

---

## Konfiguracja per platforma (OAuth setup)

Każdy provider wymaga konta developera + zarejestrowanej aplikacji z redirect URI:
- `http://localhost:3000/api/auth/callback/<provider>` (dev)
- `https://ghost-empire-web.vercel.app/api/auth/callback/<provider>` (prod)

| Provider | Gdzie | Wymagane scopes |
|---|---|---|
| Twitch | [dev.twitch.tv/console](https://dev.twitch.tv/console/apps) | `openid user:read:email` (login) + `channel:read:subscriptions bits:read` (EventSub) |
| Discord | [discord.com/developers](https://discord.com/developers/applications) | `identify email guilds` |
| Google | [console.cloud.google.com](https://console.cloud.google.com) | `openid email profile` |
| Kick | [docs.kick.com](https://docs.kick.com/getting-started/kick-developer-api) (beta) | `user:read` |
| Streamlabs | [streamlabs.com/dashboard](https://streamlabs.com/dashboard#/settings/api-settings) | `donations.read socket.token` |

Env vars dla każdego: `<PROVIDER>_CLIENT_ID` + `<PROVIDER>_CLIENT_SECRET` (patrz `.env.example`).

### Special: Twitch EventSub auth (one-time)

Po setup OAuth, streamer musi raz autoryzować EventSub:
1. Login jako admin do portalu
2. `/admin#twitch` → "Autoryzuj jako streamer"
3. Po OAuth: kliknij "Utwórz subskrypcje" → tworzy webhook subskrypcje na Twitch
4. Od tego momentu Twitch hituje `/api/webhooks/twitch-eventsub` przy subach/giftach/bitach

### Special: Streamlabs OAuth (one-time)

1. `/admin#donations` → "Połącz Streamlabs"
2. OAuth flow → polling startuje od następnego daily cron'a (06:00 UTC)

### Special: Stream Alerts (OBS)

1. `/admin#alerts` — token się auto-generuje przy pierwszym wejściu
2. Klik **"Kopiuj URL"** → wkleisz do OBS jako **Browser Source**:
   - Width 1920, Height 1080
   - ✅ Custom CSS: (zostaw puste)
   - ✅ "Shutdown source when not visible" — OFF
   - ✅ "Refresh browser when scene becomes active" — ON
3. Test: `/admin#alerts` → "Wyślij test alert" — powinno pojawić się na overlayu

---

## Dokumenty

| Plik | Co |
|---|---|
| [`CHANGELOG.md`](CHANGELOG.md) | Historia zmian per data + Unreleased section (zawsze aktualizowane razem z kodem) |
| [`PHASE2.md`](PHASE2.md) | Roadmap Phase 2 — głównie zrealizowane (E/F/G/H/K done, I czeka na Kick API, J otwarte) |
| [`PHASE3.md`](PHASE3.md) | Plan Phase 3 — **streaming chat bot (Twitch/Kick/YouTube) + engagement features + hardware integrations + AI**. Niezaakceptowane, czeka na zgodę. |
| [`ghost-empire-web/.env.example`](ghost-empire-web/.env.example) | Pełna lista env vars dla web |
| [`ghost-empire-bot/README.md`](ghost-empire-bot/README.md) | Setup Discord bota |

## Co dalej

- Phase 2 jest zamknięte. Brak items J (YouTube super chats) i I (Kick auto-events — blocked by Kick API).
- **Phase 3 = nowy zakres** — patrz [PHASE3.md](PHASE3.md). Czeka na decyzję który sub-phase (3A/3B/3C/3D) i które features priorytet.

## License

Private — Gh0s777tt © 2026
