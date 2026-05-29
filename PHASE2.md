# Phase 2 — Roadmap & Setup Instructions

Things that need either **external account setup by Gh0s77tt** or **bigger engineering** that doesn't fit one session. Each item has step-by-step instructions.

---

## ✅ PHASE 2 — ZAMKNIĘTE (2026-05)

**Wszystkie items E–K zrealizowane i na produkcji.** Ten plik zostaje jako dokumentacja setupu (instrukcje „Co musisz zrobić” są nadal aktualne przy konfiguracji od zera).

| # | Feature | Status |
|---|---|---|
| E | Login przez Kick (custom OAuth provider) | ✅ DONE |
| F | Login przez YouTube/Google | ✅ DONE |
| G | Donacje (Streamlabs) | ✅ DONE |
| H | Twitch EventSub (subs/gifts/bits + hype train) | ✅ DONE |
| I | Kick auto-events (webhooki) | ✅ DONE — *odblokowane, Kick udostępnił webhooki* |
| J | YouTube super chats / members | ✅ DONE |
| K | Stream alerts (overlay OBS) | ✅ DONE — *DB-backed kolejka + polling zamiast Pusher/WS (Vercel Hobby)* |

➡️ Następny zakres: [PHASE3.md](PHASE3.md) (chat bot + engagement). Pełne podsumowanie w [README.md](README.md) i [CHANGELOG.md](CHANGELOG.md).

---

## E. Login przez Kick

### Status: ✅ DONE — Kick działa jako logowanie (custom provider)

KICK Developer API jest w **beta** — wymaga rejestracji i weryfikacji aplikacji. Czasem trwa kilka dni.

### Co musisz zrobić

1. **Zarejestruj się** na [docs.kick.com/getting-started/kick-developer-api](https://docs.kick.com/getting-started/kick-developer-api)
2. Utwórz nową aplikację:
   - **Name:** Ghost Empire Portal
   - **Description:** Community portal for streamer Gh0s77tt with token economy
   - **Redirect URIs:**
     - `http://localhost:3000/api/auth/callback/kick`
     - `https://ghost-empire-web.vercel.app/api/auth/callback/kick`
   - **Scopes:** `user:read` (minimum)
3. Poczekaj na zatwierdzenie (zwykle 1-7 dni)
4. Po zatwierdzeniu skopiuj:
   - `CLIENT_ID`
   - `CLIENT_SECRET`
5. Wklej mi je w czacie i powiedz "podepnij Kick"

### Co ja zrobię po dostaniu credentials (~45 min)

- Dodam env vars `KICK_CLIENT_ID` + `KICK_CLIENT_SECRET` do Vercel
- Stworzę custom provider w `next-auth` (Kick używa OAuth 2.0 — nie ma gotowego providera w next-auth, trzeba napisać)
- Dodam ikonę Kick do signin page
- Test flow

---

## F. Login przez YouTube (Google)

### Status: ✅ DONE — Google/YouTube działa jako logowanie

YouTube używa Google OAuth (od dłuższego czasu). Konfig trwa 5-10 minut.

### Co musisz zrobić

1. **Wejdź na** [console.cloud.google.com](https://console.cloud.google.com)
2. **Create Project** → nazwa: `Ghost Empire`
3. **APIs & Services → Library** → włącz:
   - **Google+ API** (jeśli widzisz)
   - **YouTube Data API v3**
4. **OAuth Consent Screen:**
   - User type: **External**
   - App name: Ghost Empire
   - User support email: Twój email
   - Developer contact: Twój email
   - Scopes: dodaj `openid`, `email`, `profile`
   - Test users: dodaj swój email (dopóki nie zostaniesz zweryfikowany)
5. **Credentials → Create Credentials → OAuth Client ID:**
   - Type: **Web application**
   - Name: Ghost Empire Web
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback/google`
     - `https://ghost-empire-web.vercel.app/api/auth/callback/google`
6. Skopiuj `CLIENT_ID` + `CLIENT_SECRET`
7. Wklej mi je i powiedz "podepnij YouTube"

### Co ja zrobię (~30 min)

- Dodam env vars do Vercel
- Wstawię `GoogleProvider` z next-auth (gotowy, działa od razu)
- Custom button "Zaloguj przez YouTube" z brand kolorami YT
- (Opcjonalnie) Zachowam YouTube Channel ID przy linkowaniu (do auto-sub-count w przyszłości)

---

## G. Donacje (StreamPay / PayMedia / Streamlabs)

### Status: ✅ DONE — wybrany Streamlabs (daily polling cron, auto-match po nicku)

### Porównanie

| System | Plusy | Minusy | API |
|---|---|---|---|
| **StreamElements** | Najpopularniejsze wśród streamerów PL | Brak natywnego PL | Webhooks + REST |
| **Streamlabs** | Polski support, czat-overlay świetne | Mniej zaawansowane API niż SE | Webhooks + REST |
| **Tipply** | Najbardziej PL-focused, BLIK | Tylko PL rynek | Webhooks (płatne tier?) |
| **StreamPay** | Nowoczesny, fair pricing | Małe community | REST + webhooks |
| **PayMedia** | Ostatnio popularne PL | Nowy, mniejsza dokumentacja | Webhook |

### Co musisz zrobić

1. **Wybierz jeden system** (jeśli waham — Streamlabs ma najlepsze API i najwięcej featureów)
2. Załóż konto u nich
3. W ustawieniach znajdź **Webhooks** lub **API**
4. Skonfiguruj webhook URL na: `https://ghost-empire-web.vercel.app/api/webhooks/donation`
5. Skopiuj **signing secret** (lub API key)
6. Wklej mi go w czacie z nazwą systemu

### Co ja zrobię (~60 min na wybrany)

- Stworzę endpoint `/api/webhooks/donation` z weryfikacją podpisu
- Mapowanie kwota PLN → Ghost Tokens (np. 1 PLN = 100 GT)
- Auto-flag `User.isDonator = true` po pierwszej donacji
- Auto-increment `totalDonated` (przelicz na grosze dla precyzji)
- Notyfikacja "Dziękujemy za donację X PLN — dostałeś Y GT!"
- Stream alert event (gdy zrobimy K)

---

## H. Twitch EventSub — auto-tracking bits/subs/gift subs/follows

### Status: ✅ DONE — EventSub łapie suby / gift suby / bity (+ hype train w Phase 3)

Twitch EventSub to system webhooks Twitcha. Pingują nas gdy:
- Ktoś cheeruje bits
- Nowy sub
- Gift sub
- Nowy follower
- Hype train start/end

### Co musisz zrobić

1. W [dev.twitch.tv/console](https://dev.twitch.tv/console/apps) → Twoja aplikacja → edytuj
2. Dodaj OAuth Redirect URLs jeśli brakuje
3. **WAŻNE:** scope, które musi mieć Twoja appka:
   - `channel:read:subscriptions`
   - `bits:read`
   - `moderator:read:followers`
   - `channel:read:hype_train`
4. Powiedz mi że gotowe — ja autoryzuję z Twoim Twitch ID (jednorazowo)

### Co ja zrobię (~2-3h)

- Endpoint `/api/webhooks/twitch-eventsub` z weryfikacją HMAC sign
- Endpoint `/api/admin/twitch-subscribe` do tworzenia subskrypcji eventów
- Handler dla każdego event typu:
  - `channel.subscribe` → ustaw `Connection.isSubscriber = true`, ustaw `subTier`
  - `channel.subscription.gift` → grant tokeny donorowi
  - `channel.cheer` → grant tokeny dające bits (proporcjonalnie)
  - `channel.follow` → mała nagroda + grant achievement
  - `channel.hype_train.begin` → automatyczny happy hour ×2!
- UI w `/admin` do subskrypcji eventów (one-time setup)
- Auto-renew subskrypcji co 7 dni (Twitch wymaga)

---

## I. Kick events tracking

### Status: ✅ DONE — odblokowane. Kick udostępnił webhooki, mamy receiver `/api/webhooks/kick-events`

Kick API jest w **beta** i nie ma jeszcze publicznych webhooks. Co możemy zrobić teraz:
- Polling `/api/v2/channels/gh0s77tt` co 30s (limit 60 req/min)
- Wykrywać NEW followers (porównujemy count z poprzednim)
- Wykrywać NEW subs (jeśli Kick udostępni endpoint — obecnie tylko private)

### Co teraz

Czekamy aż Kick udostępni:
- `GET /api/v2/channels/{slug}/subscriptions` (publicznie)
- WebSocket events / webhooks
- `kicks` event (Kick's bits equivalent)

Gdy będzie API → ~2h roboty.

---

## J. YouTube super chats / sponsors / members

### Status: ✅ DONE — super chaty + membery podczas live (polling przez cron-job.org)

YouTube Data API v3 ma:
- `liveChat/messages.list` — czyta super chats podczas live (10s polling)
- `members.list` — lista YouTube Members (sponsorów) — wymaga channel ownership

### Limity

- 10,000 jednostek quota dziennie (każdy poll = 1-5 jednostek)
- Polling 10s × 60 min × 3h stream = 1080 calls × 1 jednostka = 1080 z 10000 daily quota = OK
- Quota da się rozszerzyć przez Google

### Co musisz zrobić

1. Po F (Google OAuth) — dodaj scope: `https://www.googleapis.com/auth/youtube.readonly`
2. Autoryzuj z YouTube channel ownership Gh0s77tt

### Co ja zrobię (~3h)

- Cron job (Vercel Cron) co 10s podczas live (zacznij polling gdy live, zatrzymaj gdy off)
- Endpoint `/api/yt/poll-live-chat` 
- Wykrywanie super chats → grant tokens donorowi
- Wykrywanie members → flag `Connection.isSubscriber=true` na YouTube

---

## K. Stream notifications (alerty na OBS)

### Status: ✅ DONE — overlay OBS gotowy (DB-backed kolejka + polling 1.2 s zamiast Pusher/WS)

System alertów wyświetlanych przez OBS gdy:
- User wygra giveaway
- User kupi nagrodę  
- User wbije level
- Nowy donator
- User claimnie drop code (pierwsze N osób = bonus)

### Architektura

```
[Portal event happens]
        ↓
[POST internal /api/alerts/dispatch]
        ↓
[Pusher / Ably / Vercel Edge WebSocket]
        ↓
[OBS browser source / overlay app subscribes]
        ↓
[Alert popup on stream]
```

### Co potrzeba

1. **WebSocket / Server-Sent Events provider:**
   - Pusher (free 100k msgs/day, simple) — najprostsze
   - Ably (alternatywa, też darmowy tier)
   - Lub native Vercel Edge SSE (najbardziej kontroli)
2. **Endpoint `/overlay`** — page którą OBS otwiera jako browser source
   - Bez UI normalnego portalu
   - Transparent background
   - Słucha eventów WS i animuje
   - Konfigurowalna pozycja, dźwięk, czas wyświetlania
3. **Endpoint `/admin/alerts`** — UI streamera do:
   - Włączania/wyłączania alertów per typ
   - Customizacja designu (kolor, font, sound)
   - Test alert button
4. **Trigger hooks** w istniejących endpointach:
   - `/api/shop/buy` → dispatch alert "kupił X"
   - `/api/admin/events/draw` → dispatch alert "wygrał"
   - `/api/drops/claim` (jeśli bonus) → dispatch alert "złapał bonus"
   - Welcome bonus w `auth.ts` → dispatch alert "dołączył"

### Stages

1. **Stage 1 (1h):** Pusher setup + prosty alert "Welcome to chat" (test)
2. **Stage 2 (2h):** OBS overlay page z 1 animacją + dispatch z 2 endpointów
3. **Stage 3 (1h):** Admin customization UI
4. **Stage 4 (2h):** Wszystkie event types, sound system, multiple queue

---

## Aktywność na kanałach: bits / kick points / cheery / podarowane suby

To jest podsumowanie H+I+J — wymaga ich wszystkich. Gdy będą gotowe:

| Aktywność | Jak nagrody są przyznawane | Mnożnik bazowy (do dostrojenia) |
|---|---|---|
| **Twitch bits cheered** | Per cheer event → tokeny = bits × 10 (np. 100 bits = 1000 GT) | × 10 |
| **Twitch new sub** | Sub event → grant 5000 GT subskrybentowi | flat |
| **Twitch gift sub** | Gift event → grant 5000 GT giftującemu, 3000 GT recipient | T1=1×, T2=3×, T3=10× |
| **Twitch follow** | Follow → grant 500 GT (jeden raz) | flat |
| **Kick subs (gdy będzie API)** | Sub → 5000 GT (analogicznie do Twitch) | flat |
| **Kick kicks (Kick's bits)** | Per kick event → tokeny | × 10 |
| **YouTube super chat** | Super chat → tokeny proporcjonalne do kwoty | 100 GT / 1 PLN |
| **YouTube member** | Membership level → 5000 GT (raz) | flat |

Wszystko trafia do istniejącego endpoint `/api/internal/award` z odpowiednim `reason`. Trzeba tylko dodać:
- New `reason` strings: `"twitch_cheer"`, `"twitch_sub"`, `"twitch_gift_sub"`, `"twitch_follow"`, `"kick_sub"`, `"kick_kicks"`, `"yt_superchat"`, `"yt_member"`
- Aktualizacja `prettyReason()` w `/profile` ProfileClient
- Multipliers w trigger functions

---

## Priorytety (historyczne — wszystko zrealizowane ✅)

| # | Co | Trudność | Status |
|---|---|---|---|
| 1 | F — YouTube OAuth | ★ łatwe | ✅ DONE |
| 2 | G — Donacje (Streamlabs) | ★★ | ✅ DONE |
| 3 | E — Kick OAuth | ★★ | ✅ DONE |
| 4 | K — Stream alerts | ★★★ | ✅ DONE (DB-backed, nie Pusher) |
| 5 | H — Twitch EventSub (bits/subs) | ★★★★ | ✅ DONE |
| 6 | J — YouTube super chats | ★★★ | ✅ DONE |
| 7 | I — Kick auto-events | — | ✅ DONE (Kick wydał webhooki) |
