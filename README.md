<div align="center">

# 👻 GHOST EMPIRE

**Community portal + ekosystem botów dla streamera [Gh0s77tt](https://twitch.tv/gh0s77tt)**

Twitch · Kick · YouTube · Discord — jedna tokenowa ekonomia, eventy, predictions, battle pass i alerty OBS.

<br/>

![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?style=flat-square&logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![NextAuth](https://img.shields.io/badge/Auth-NextAuth%20v4-000000?style=flat-square&logo=auth0&logoColor=white)
![Deploy](https://img.shields.io/badge/Vercel-deployed-000000?style=flat-square&logo=vercel&logoColor=white)
![Status](https://img.shields.io/badge/Phase%202-zamknięte-10b981?style=flat-square)
![Status](https://img.shields.io/badge/Phase%203A%2B3B-done-10b981?style=flat-square)
![Status](https://img.shields.io/badge/Phase%203C%2F3D-planowane-E50914?style=flat-square)

<br/>

[**🌐 Live**](https://ghost-empire-web.vercel.app) ·
[**📜 Changelog**](CHANGELOG.md) ·
[**🗺️ Roadmap**](ROADMAP.md) ·
[Twitch](https://twitch.tv/gh0s77tt) ·
[Kick](https://kick.com/Gh0s77tt) ·
[YouTube](https://www.youtube.com/@Gh0s77tt)

</div>

---

## ⚡ TL;DR

Portal Next.js + boty, w których widzowie zarabiają **Ghost Tokens (GT)** za aktywność na Discordzie i streamach (czat, voice, suby, bity, donejty, drop codes, daily questy, predictions) i wymieniają je w sklepie na nagrody cyfrowe i fizyczne. Streamer steruje wszystkim z panelu `/admin` (22 sekcje): sklep, eventy, losowania, donacje, role, alerty OBS, stream goals, predictions, battle pass, merge duplikatów kont + **komendy czatu, timery, FAQ, powitania i song requests** dla bota na 3 platformach.

Suby na Twitch/Kick, gifty, bity i donacje (Streamlabs + YouTube Super Chat) są **wykrywane automatycznie** przez webhooki/polling i nagradzane tokenami + odznakami.

---

## 🗂️ Monorepo layout

```
ghost-empire-phase1/
├── ghost-empire-web/        ← Next.js 15 portal (Vercel deploy)        ✅ aktywny
├── ghost-empire-bot/        ← Discord bot (Node + discord.js)          ✅ aktywny
└── ghost-empire-chat/       ← Twitch/Kick/YouTube chat bot             ✅ aktywny (3A + 3B)
```

| Warstwa | Tech |
|---|---|
| Frontend | Next.js 15 (App Router, RSC), React 18, Tailwind CSS, Lucide icons, next/font |
| Backend | Next.js API routes, Prisma ORM, PostgreSQL (Supabase + pgbouncer) |
| Auth | NextAuth v4 + PrismaAdapter, 4 OAuth providery (Twitch / Kick / Discord / Google) |
| Realtime | DB-backed kolejki + polling (Vercel Hobby = brak websocketów) |
| Bot | discord.js 14, TypeScript, tsx |
| Deploy | Vercel (web, auto-deploy z `main`) + lokalny/Railway (bot) |

---

## 🎮 Features

### Phase 1 — Core ✅

- **Logowanie** przez Twitch / Kick / Discord / Google — wszystko linkowalne na jedno konto z poziomu `/profile`
- **Ghost Tokens** za aktywność: Discord msg/voice, daily questy, drop codes (+ wszystkie źródła streamowe z Phase 2)
- **Sklep** (`/shop`) — itemy w kategoriach z requirementami (level, sub tier, dual platform)
- **Eventy** (`/events`) — giveaway, raffle z biletami, contest, happy hour (mnożnik ×2)
- **Ranking** (`/ranking`) — 4 metryki (balans / lifetime / level / streak) + podium + admin quick-actions
- **Profil** (`/profile`) — level/XP, transakcje, social tiles (auto z OAuth), połączone platformy
- **Achievementy** (`/achievements`) — **53 odznaki** w 4 rzadkościach (common/rare/epic/legendary), auto-przyznawane
- **Daily quests** (`/quests`) — 3 dziennie + bonus za komplet
- **Drop codes** (`/drops`) — kody podczas live, pierwsze N osób = bonus
- **Public profile** (`/u/[username]`) — read-only profil + OG image dla social share
- **Notyfikacje** — bell widget z pollingiem
- **Discord bot** — tracking message + voice, slash commands (`/link`, `/portal`, `/help`), live config bez restartu

### Phase 2 — Multi-platforma + monetyzacja ✅ (zamknięte)

- **Kick + Google/YouTube OAuth** — custom Kick provider (brak gotowca w next-auth)
- **Account linking + merge** — dolinkuj platformy z profilu; admin scala stare duplikaty (atomic `$transaction`)
- **Twitch EventSub** — auto-tracking subów / gifted subów / bitów (HMAC verify, replay protection, idempotency)
- **Donacje Streamlabs** — daily polling cron, auto-match po nicku, 1 PLN = 100 GT (konfigurowalne)
- **Kick webhooki** (*item I — domknięty*) — suby / gift suby / followy (RSA-SHA256 verify, replay protection)
- **YouTube Live** (*item J — domknięty*) — Super Chaty + membery wykrywane podczas live broadcast (polling + quota-aware)
- **Stream Alerts (OBS)** — `/overlay?token=` jako Browser Source, polling 1.2 s, animacje slide-in + dźwięk, dispatch z 10+ miejsc

### Phase 3 — Engagement ✅ (3A + 3B zrealizowane)

- **Stream Goals + Hype Train** — cele na żywo (subs/gifts/follows/donations/bits/yt-members), overlay OBS `/overlay/goals`, auto-inkrementacja z EventSub/Streamlabs/YouTube
- **Predictions / Zakłady GT** (`/predictions`) — obstawiaj wynik streama, wygrywający dzielą całą pulę proporcjonalnie do stawek; pełny refund przy cancelu / braku zwycięzców
- **Battle Pass / Sezony** (`/seasons`) — miesięcznie-rolujące sezony, 30 tierów × 5000 XP, XP z 11 źródeł aktywności, free + premium track
- **53 achievementy** — rozbudowa o donacje, suby, gifty, bity, super chaty, dropy, eventy, zakupy, linkowanie (auto-grant engine)
- **Chat bot na Twitch + Kick + YouTube** (`ghost-empire-chat`, *Phase 3A*) — **1 GT/min/widz** na każdej platformie, komendy zarządzane z portalu (`/admin#chat`, koniec hardkodów), auto-refresh tokenów (Twitch reconnect 3h, Kick rotacja, YouTube live-only quota-aware)
- **Engagement (3B)** — **timery** (cykliczne wiadomości, `#timers`), **FAQ / auto-odpowiedzi** na słowa kluczowe (`#faq`), **powitania** widzów (`#welcome`), **song requests** `!sr` z kolejką (`#songs`), **chat overlay OBS** łączący czat z 3 platform (`/overlay/chat`)
- **NASTĘPNE → Phase 3C / 3D** — customizacja alertów per-typ, OBS WebSocket (sceny), Philips Hue / Govee (efekty świetlne), AI moderator, analityka per-stream + heatmapy, Subathon. Plan w [PHASE3.md](PHASE3.md).

---

## 🛡️ Reliability · Security · Performance · DX

Twarda warstwa „top of the top” pod produkcję — wszystko zweryfikowane buildem.

| Obszar | Co |
|---|---|
| **Reliability** | `error.tsx` + `global-error.tsx` (brak białych ekranów), `loading.tsx` (instant feedback na nawigacji), atomic `$transaction` na każdej mutacji ekonomii |
| **PWA / mobile** | instalowalny (manifest + maskable ikony + apple-icon), `theme-color`, `colorScheme: dark`, naprawiony favicon |
| **SEO** | `robots.ts` + `sitemap.ts` (13 publicznych tras), OG images (Satori), brak indeksacji prywatnych tras |
| **A11y** | pełne wsparcie `prefers-reduced-motion`, wymiary obrazków (brak CLS) |
| **Security** | HSTS preload, CSP (`object-src 'none'`, `upgrade-insecure-requests`), COOP, X-Frame-Options, Permissions-Policy; rate limiting (DB sliding-window) na **całej** ekonomii; webhook signature verify (HMAC/RSA); HMAC-signed cookies dla linkowania; crypto-secure RNG dla losowań/dropów; audit log każdej akcji admina z IP |
| **Performance** | cache publicznych zapytań (`unstable_cache`), indeksy DB na hot queries, lazy-load sekcji admina (18→7 zapytań), Router Cache `staleTimes`, równoległe zapytania (`Promise.all`), `optimizePackageImports`, natywny lazy-load avatarów (oszczędność quoty Vercel) |
| **DX / Code Quality** | `strict: true` TypeScript, **zero `as any`** w `src`, ESLint (`next/core-web-vitals`) wpięty w build, CHANGELOG + dokumentacja aktualizowane razem z kodem |

> Szczegóły każdej zmiany: [CHANGELOG.md](CHANGELOG.md). Co jeszcze planujemy: [ROADMAP.md](ROADMAP.md).

---

## 🧑‍💻 Admin panel (`/admin`)

Sidebar z **22 sekcjami** (deep-link przez hash, np. `/admin#predictions`), filtrowane wg uprawnień moderatora:

| Sekcja | Co |
|---|---|
| **Dashboard** | skróty + statystyki + pending orders / aktywne eventy / dropy |
| **Użytkownicy** | grant tokenów, role userów, role per-platforma (sub tier / mod / vip) |
| **Merge duplikatów** | wykrywanie + scalanie zduplikowanych kont |
| **Eventy** | tworzenie, edycja, losowanie zwycięzców |
| **Sklep** | manage items, dostarczanie zakupów |
| **Drops** | tworzenie kodów + statystyki claim |
| **Harmonogram** | sloty streamów (publiczne) |
| **Bot Discord** | live config rewards/cooldowns (bez restartu) |
| **Donacje** | Streamlabs connection + unmatched donations |
| **Twitch** | EventSub subskrypcje + log eventów (subs/gifts/bits) |
| **Kick** | autoryzacja + webhook subskrypcje + log eventów |
| **YouTube** | autoryzacja + setup pollingu super chatów/memberów |
| **Komendy czatu** | custom commands bota (`#chat`) — bot pobiera co ~2 min |
| **Timery** | cykliczne wiadomości bota na 3 platformach (`#timers`) |
| **FAQ / auto** | auto-odpowiedzi na słowa kluczowe (`#faq`) |
| **Powitania** | powitanie pierwszej wiadomości widza (`#welcome`) |
| **Song requests** | kolejka `!sr` — play / skip / clear (`#songs`) |
| **Stream Alerts** | overlay OBS, rotacja tokenu, customizacja per-typ |
| **Stream Goals** | cele + Hype Train, progress bary, overlay |
| **Predictions** | tworzenie zakładów, rozstrzyganie, cancel z refundem |
| **Battle Pass** | zarządzanie sezonem + nagrody per tier |
| **Audit log** | pełna historia akcji adminów (kto/kiedy/co/IP) |

---

## 🚀 Setup od zera

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
npm run db:seed     # 53 achievementy, daily tasks, shop items, events
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
2. Vercel auto-deploy z `main`
3. Env vars w Project Settings → Environment Variables (kopiuj z `.env.example`)
4. Każdy nowy provider OAuth → dodaj URL callback do panelu providera (np. `https://ghost-empire-web.vercel.app/api/auth/callback/twitch`)

> ⚠️ **Po każdym pull sprawdź sekcję „Setup wymagany po pull” w [CHANGELOG.md](CHANGELOG.md)** — niektóre zmiany wymagają `npm run db:push` / `npm run db:seed` albo nowego env var w Vercel.

---

## 🔌 Konfiguracja per platforma (OAuth setup)

Każdy provider wymaga konta developera + zarejestrowanej aplikacji z redirect URI:
- `http://localhost:3000/api/auth/callback/<provider>` (dev)
- `https://ghost-empire-web.vercel.app/api/auth/callback/<provider>` (prod)

| Provider | Gdzie | Wymagane scopes |
|---|---|---|
| Twitch | [dev.twitch.tv/console](https://dev.twitch.tv/console/apps) | `openid user:read:email` (login) + `channel:read:subscriptions bits:read channel:read:hype_train` (EventSub) |
| Discord | [discord.com/developers](https://discord.com/developers/applications) | `identify email guilds` |
| Google | [console.cloud.google.com](https://console.cloud.google.com) | `openid email profile` + `youtube.readonly` (super chaty) |
| Kick | [docs.kick.com](https://docs.kick.com/getting-started/kick-developer-api) (beta) | `user:read` (login) + `channel:read events:subscribe` (webhooki) |
| Streamlabs | [streamlabs.com/dashboard](https://streamlabs.com/dashboard#/settings/api-settings) | `donations.read socket.token` |

Env vars dla każdego: `<PROVIDER>_CLIENT_ID` + `<PROVIDER>_CLIENT_SECRET` (patrz `.env.example`).

### Special: Twitch EventSub (one-time)

1. `/admin#twitch` → „Autoryzuj jako streamer” (scopes powyżej)
2. „Utwórz subskrypcje” → tworzy webhook subskrypcje na Twitchu
3. Twitch hituje `/api/webhooks/twitch-eventsub` przy subach/giftach/bitach/hype train

### Special: Kick webhooki (one-time)

1. `/admin#kick` → „Autoryzuj Kick” (PKCE flow)
2. „Utwórz subskrypcje” → backend tworzy webhook subscriptions (sub/renewal/gifts/follow/livestream status)
3. Kick hituje `/api/webhooks/kick-events`

### Special: YouTube Super Chaty (one-time + cron)

1. `/admin#youtube` → „Autoryzuj YouTube” (osobny flow od loginu, scope `youtube.readonly`)
2. Vercel Hobby nie obsłuży auto-pollingu — UI pokazuje setup dla **cron-job.org** uderzającego `/api/yt/poll-live-chat` (Bearer `BOT_SECRET`) podczas live

### Special: Streamlabs (one-time)

1. `/admin#donations` → „Połącz Streamlabs”
2. Polling startuje od następnego daily cron'a (limit Vercel Hobby)

### Special: Stream Alerts (OBS)

1. `/admin#alerts` — token auto-generuje się przy pierwszym wejściu
2. „Kopiuj URL” → OBS **Browser Source** (1920×1080, „Shutdown source when not visible” = OFF, „Refresh when scene active” = ON)
3. „Wyślij test alert” → powinno pojawić się na overlayu

---

## 📚 Dokumenty

| Plik | Co |
|---|---|
| [`CHANGELOG.md`](CHANGELOG.md) | Historia zmian per data (aktualizowane razem z kodem) + „Setup wymagany po pull” |
| [`ROADMAP.md`](ROADMAP.md) | Plany na przyszłość + konsolidacja propozycji optymalizacji i usprawnień |
| [`PERMISSIONS.md`](PERMISSIONS.md) | Ściąga uprawnień **admin vs moderator** (przydatne przy nadawaniu rang) |
| [`PHASE2.md`](PHASE2.md) | Roadmap Phase 2 — **zamknięte** (items E–K wszystkie done) |
| [`PHASE3.md`](PHASE3.md) | Phase 3 — chat bot (3A) + engagement (3B) + alerts/hardware (3C) + AI/analytics (3D); część shipped, reszta planowana |
| [`ghost-empire-web/.env.example`](ghost-empire-web/.env.example) | Pełna lista env vars dla web |
| [`ghost-empire-bot/README.md`](ghost-empire-bot/README.md) | Setup Discord bota |

---

## 🗺️ Co dalej

- **Phase 2 + Phase 3A + 3B = zrobione.** Portal + Discord bot + **chat bot na Twitch/Kick/YouTube** z komendami z portalu, timerami, FAQ, powitaniami, song requests i chat overlayem OBS. Wszystko live, zmergowane do `main`.
- **Następny duży krok: Phase 3C / 3D** — customizacja alertów per-typ + hardware (OBS WebSocket, Philips Hue / Govee) oraz AI/analityka (AI moderator, heatmapy czatu, Subathon). Pełen plan w [PHASE3.md](PHASE3.md).
- **Optymalizacje i usprawnienia** — pełna lista propozycji (testy integracyjne/E2E, monitoring/Sentry, CSP nonces, React Compiler i in.) w [ROADMAP.md](ROADMAP.md).

---

<div align="center">

**Private** — Gh0s77tt © 2026

</div>
