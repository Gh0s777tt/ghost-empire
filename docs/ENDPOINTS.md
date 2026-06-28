# 🌐 ENDPOINTS.md — API portalu

Spis tras API (`ghost-empire-web/src/app/api/**`), pogrupowany wg modelu autoryzacji. Skróty:

- **session** — wymaga zalogowanego usera (NextAuth)
- **admin** — `requireAdmin()` (pełny admin)
- **perm:X** — `requirePermission("X")` (admin LUB moderator z uprawnieniem X)
- **botSecret** — `Authorization: Bearer <BOT_SECRET>` (boty)
- **overlayToken** — `?token=<OVERLAY_TOKEN>` (źródła OBS, tylko odczyt)
- **public** — bez auth (lub własny podpis/sekret)

---

## 🆕 Nowe trasy — Studio (2026-06) — łącznie **187** tras (186× `route.ts` + 1× `route.tsx`)

**Admin (`requireAdmin`):**
| Trasa | Po co |
|---|---|
| `…/api/admin/moderation` | Config automoda (przekleństwa/CAPS/długość/flood/zalgo + akcje) |
| `…/api/admin/integrations` | Klucze API funkcji (AI / Sentry / OBS) — zapis w bazie, maskowane |
| `…/api/admin/setup-status` | Checklista konfiguracji na dashboardzie |
| `…/api/admin/backup` | Pobranie backupu JSON (config/katalog/salda, bez sekretów) |
| `…/api/admin/widgets` | CRUD własnych widgetów (generator) |

**Bot (`botSecret`):**
| `…/api/bot/moderation` | public GET — config automoda dla bota |
| `…/api/bot/active-prediction` | public GET — otwarty zakład (auto-pin na czacie) |
| `…/api/internal/emoji-combo` | POST — bot zgłasza wykryty emoji-combo |

**Overlay feeds (`overlayToken`):**
| `…/api/alerts/predictions` · `…/api/alerts/polls` | aktywny zakład / ankieta |
| `…/api/alerts/recent-events` | ostatni sub / donator / follower |
| `…/api/alerts/viewers` | liczba widzów (Helix, cache 12s) |
| `…/api/alerts/widget` | pojedynczy custom-widget po `id` |
| `…/api/alerts/emoji-combo` | świeży emoji-combo |

**Zmienione:** `admin/subathon` (+`appearance`), `admin/predictions`/`admin/polls` (+`accentColor`), `alerts/subathon` (+kolor/napis), `alerts/chat` + `internal/chat-feed` (+`emotes`/`badges`), `webhooks/twitch-eventsub` (+`channel.follow` v2).

---

## Auth / logowanie
| Trasa | Auth | Po co |
|---|---|---|
| `…/api/auth/[...nextauth]` | public | NextAuth (login/logout/sesja) — Twitch/Discord/Google/Kick |
| `…/api/auth/streamlabs` + `/callback` | session | OAuth Streamlabs (połączenie konta donacji) |

## Akcje użytkownika (session)
| Trasa | Metoda | Po co |
|---|---|---|
| `…/api/shop/buy` | POST | Zakup przedmiotu (sprawdza wymagania: level/sub/mc/osiągnięcie) |
| `…/api/polls/vote` | POST | Głos w ankiecie (1/usera, zmienialny; rate-limit) |
| `…/api/predictions` · `…/api/predictions/[id]/wager` | GET/POST | Predykcje + obstawianie GT (auto-zamykanie po `closesAt`) |
| `…/api/bounties` · `…/api/bounties/pledge` | GET/POST | Viewer Bounties — lista/otwórz wyzwanie + zrzutka GT do puli (escrow, atomowo) |
| `…/api/wheel` · `…/api/wheel/spin` | GET/POST | Koło Fortuny — stan + zakręcenie (wydaje GT, rate-limit 20/min) |
| `…/api/games` | GET | Publiczna biblioteka gier (widoczne, wg czasu gry) |
| `…/api/games/vote` | POST | Głos „zagraj następne" — 1 gra/widz/portal (zalogowany), set/clear, tenant-scoped (#628) |
| `…/api/daily-bonus` | GET/POST | Dzienny bonus GT (stan + odbiór, streak) |
| `…/api/events/join` · `…/api/events/raffle-tickets` | POST | Dołączenie do eventu / kupno losów raffle |
| `…/api/drops/claim` | POST | Odbiór drop-code z czatu |
| `…/api/seasons/claim` | POST | Odbiór nagrody Battle Pass |
| `…/api/tasks/claim` | POST | Odbiór nagrody za daily questa |
| `…/api/notifications` | GET/POST | Lista / oznaczanie powiadomień |
| `…/api/profile/social-links` | GET/POST | Linki społecznościowe profilu |
| `…/api/profile/discord-link-code` | POST | Kod do powiązania konta Discord |
| `…/api/profile/connections/unlink` · `…/link/[provider]` | POST | Odłączanie / łączenie platform |
| `…/api/push/vapid` | GET | Publiczny klucz VAPID dla klienta (null = push uśpiony) |
| `…/api/push/subscribe` · `…/api/push/unsubscribe` | POST | Zapis / usunięcie subskrypcji web push (#533) |
| `…/api/push/test` | POST | Testowe powiadomienie na własne urządzenia (weryfikacja pętli) |
| `…/api/profile/country` | POST | Ustawienie/wyczyszczenie kraju (flaga na profilu, #540) |
| `…/api/profile/accent` | POST | Ustawienie/wyczyszczenie koloru akcentu profilu (#546) |
| `…/api/profile/shipping` | GET/PUT/DELETE | Szyfrowany profil wysyłkowy PII do nagród fizycznych — tylko właściciel; PUT wymaga zgody, DELETE = erasure GDPR (#609) |
| `…/api/profile/donation-code` | GET | Osobisty kod weryfikacyjny donacji (lazy-mint) — wpisany w wiadomości donacji kredytuje GT zweryfikowanemu userowi (#612) |
| `…/api/profile/export` | GET | Eksport własnych danych (RODO art. 15/20) — pobranie JSON ze wszystkimi danymi konta; tylko właściciel, sekrety zredagowane, PII odszyfrowane dla właściciela (#619) |
| `…/api/profile/tickets` | GET/POST | Zgłoszenia wsparcia widza — GET lista własnych (status/odpowiedź), POST nowe zgłoszenie (rate-limit 5/h, limit 10 otwartych, powiadamia właściciela portalu) (#649) |
| `…/api/collectibles` · `…/open-pack` | GET/POST | Katalog kart + kolekcja widza; otwarcie paczki GT (#551 — atomowy zakup, ważona rzadkość) |
| `…/api/market` | GET/POST | Marketplace P2P kart (#552 — list/buy/cancel, escrow + atomowy transfer GT, 5% fee spalane) |
| `…/api/gift` | POST | Prezent GT między widzami (#553 — atomowy transfer, limity 5k/transfer + 10k/24h, powiadomienie) |
| `…/api/search/users` | **public** (rate-limit) | Szukanie widzów do palety poleceń (#549 — **bez logowania**, tylko publiczne pola, tenant-scoped, rate-limit per IP, min 2 znaki) |
| `…/api/search/semantic` | **public** (rate-limit) | Semantic search po znaczeniu (#554 — **bez logowania**, embeddingi AI + cosine, rate-limit per IP; uśpione bez klucza OpenAI) |
| `…/api/profile/social-click` | POST | Licznik klików linku społ. (#542 — beacon z `/u/<nick>`, rate-limit per IP) |
| `…/api/auth/passkey` | GET/DELETE | Lista / usunięcie passkeys użytkownika (#543) |
| `…/api/auth/passkey/register/options` · `…/verify` | POST | Ceremonia rejestracji passkey (WebAuthn, #543) |
| `…/api/auth/passkey/login/options` · `…/verify` | POST | Logowanie passkey (#544 — bez auth; verify tworzy sesję DB + cookie) |
| `…/api/clans` | GET/POST | Klany/drużyny — mój klan + ranking skarbca (GET); POST = utwórz / dołącz / opuść / wpłać GT (#477) |
| `…/api/clips` | GET/POST | Klip tygodnia — klipy + liczby głosów + mój głos (GET publiczne); POST = głos (1/tydzień ISO, #502) |
| `…/api/companion` | GET/PATCH | Ghost Companion usera (create-on-read); PATCH = akcje (karmienie/zmiana nazwy) |
| `…/api/companion/feed` | POST | Karmienie companiona GT (osobny endpoint akcji) |
| `…/api/assistant` | session + plan `ai` | Asystent pomocy („?" na każdej stronie) — wymaga zalogowania; degraduje się gdy brak planu/klucza AI |
| `…/api/trivia` | GET/POST | Trivia/quiz (widz, #523) — aktywne pytania + moje odpowiedzi; POST = odpowiedź za GT (poprawna ukryta do czasu) |
| `…/api/sound-rewards` | GET/POST | GT→dźwięki (widz, #505) — aktywny katalog + saldo; POST = wykup dźwięku (atomowy spend → alert) |
| `…/api/referral` | GET/POST | Referrals (#501) — mój kod + statystyki + czy odebrałem; POST = odbiór kodu znajomego (oboje GT) |
| `…/api/portals` | GET/POST/DELETE | Hub „przełącz portale" (#508) — portale, które obserwuję; POST follow, DELETE unfollow |
| `…/api/getting-started` | GET | Flagi ukończenia checklisty „Pierwsze kroki" na home (#503 — tylko odczyt) |

## Kasyno GT (`gt-games`) — session, bramka planu `casino`
> Mini-gry GT na stronie (`/kasyno`). Akcje gry: **session** + `featureGate("casino")` (403 gdy plan tenanta < pro). Odczyty puli/rankingu — **public**.

| Trasa | Metoda | Po co |
|---|---|---|
| `…/api/gt-games/play` | POST | Gry jednorzutowe (`slots`/`coinflip`/`roulette`) — atomowy zakład, zwraca wynik |
| `…/api/gt-games/blackjack/start` · `hit` · `stand` · `double` | POST | Blackjack — rozdanie + ruchy (stan partii server-side) |
| `…/api/gt-games/hilo/start` · `guess` · `cashout` | POST | Hi-Lo — start, zgadywanie wyżej/niżej, wypłata mnożnika |
| `…/api/gt-games/mines/start` · `reveal` · `cashout` | POST | Mines — start, odkrywanie pól, wypłata |
| `…/api/gt-games/history` | GET | Historia rozgrań usera |
| `…/api/gt-games/jackpot` | GET | **public** — stan progresywnego jackpota (seed + Redis) |
| `…/api/gt-games/leaderboard` | GET | **public** — największe wygrane + top netto (30 dni, scope per tenant) |

## Onboarding / Billing (SaaS) — session
| Trasa | Metoda | Po co |
|---|---|---|
| `…/api/onboarding` | POST | Provisioning portalu tenanta przy zakładaniu konta (slug/nazwa/branding) |
| `…/api/onboarding/my` | GET/PATCH | Stan i edycja onboardingu/brandingu własnego tenanta |
| `…/api/billing/checkout` | GET/POST | Plan + ceny (GET) / utworzenie Stripe Checkout dla planu (POST). Gdy Stripe nieskonfigurowany → 503 (trial bez karty) |

## Admin
| Trasa | Auth | Po co |
|---|---|---|
| `…/api/admin/grant-tokens` | perm:grant_tokens | +/- tokeny userowi |
| `…/api/admin/push` | admin | GET licznik subskrybentów + status; POST broadcast web push do subskrybentów portalu (#537) |
| `…/api/admin/sponsors` | admin | CRUD sponsorów/partnerów portalu (pasek na `/support`, #538) |
| `…/api/admin/user-roles` | admin | Role: admin / moderator / donator |
| `…/api/admin/connection-roles` | perm:mark_subs | Status sub/mod/VIP per platforma |
| `…/api/admin/reset-database` | admin | **Reset bazy** (wipe userów, fraza potwierdzająca) |
| `…/api/admin/shop` | perm:manage_shop | CRUD sklepu |
| `…/api/admin/seasons` | admin | Sezony + nagrody Battle Pass |
| `…/api/admin/achievements` | admin | CRUD osiągnięć + ręczne przyznawanie |
| `…/api/admin/polls` | admin | CRUD ankiet |
| `…/api/admin/codes` | admin | Pula drop-kodów (overlay) |
| `…/api/admin/events` · `/events/draw` | perm:create_events / draw_events | Eventy + losowanie |
| `…/api/admin/drops` | perm:create_drops | Drop-code'y |
| `…/api/admin/stream-goals` | admin | Stream Goals (overlay) |
| `…/api/admin/predictions` | perm:create_events | Tworzenie/rozliczanie predykcji (+ `toggle_announce`) |
| `…/api/admin/bounties` | perm:create_events | Viewer Bounties — lista + rozstrzyganie (`resolve` wykonane/odrzuć) / `delete` |
| `…/api/admin/wheel` | admin | Konfiguracja Koła Fortuny (koszt, segmenty) + statystyki |
| `…/api/admin/mod-violations` | admin | Statystyki naruszeń moderacji + top recydywiści |
| `…/api/admin/games` | admin | Biblioteka gier — konfiguracja SteamID + sync + ukrywanie |
| `…/api/admin/webhooks-out` | admin | Webhooki wychodzące — CRUD + test (POST JSON na zewnętrzne URL) |
| `…/api/admin/donations` | admin | Donacje / dopasowania |
| `…/api/admin/streamlabs` | admin | Stan połączenia Streamlabs |
| `…/api/admin/subathon` | admin | Subathon (start/stop/±czas) |
| `…/api/admin/welcome` · `chat-commands` · `chat-timers` · `faq` · `song-requests` | admin | Konfiguracja bota czatu |
| `…/api/admin/schedule` | perm:manage_shop | Harmonogram streamów |
| `…/api/admin/bot-config` | perm:manage_shop | Config bota Discord |
| `…/api/admin/ban-user` | perm:ban_users | Ban/mute |
| `…/api/admin/merge-users` | admin | Scalanie duplikatów kont |
| `…/api/admin/support-tickets` | admin | Skrzynka wsparcia — GET lista (filtr open/resolved/all, tenant-scoped), PATCH reply/resolve/reopen + powiadomienie widza (#650) |
| `…/api/admin/deliver-order` | perm:deliver_orders | Realizacja zamówień sklepu |
| `…/api/admin/analytics` | admin | Heatmapa aktywności czatu |
| `…/api/admin/alerts` | admin | Ustawienia Stream Alerts + test |
| `…/api/admin/alert-types` | admin | Typy alertów (włącz/wyłącz + progi per rodzaj) |
| `…/api/admin/custom-alerts` | admin | CRUD własnych alertów (ręczne wyzwalanie na overlayu) |
| `…/api/admin/chat-overlay` | admin | Config overlaya czatu (rozmiar/kolor/font/krycie/ikona platformy) |
| `…/api/admin/assistant` | admin/perm + plan `ai` | AI-asystent panelu (pytania o konfigurację) — wymaga planu elite |
| `…/api/admin/collectibles` | admin | CRUD katalogu kart kolekcjonerskich (#551) |
| `…/api/admin/obs-rules` | admin | CRUD reguł sterowania OBS (event→akcja, #664) — GET/POST/PATCH/DELETE, limit 50/portal |
| `…/api/admin/govee-rules` | admin | CRUD reguł oświetlenia Govee (event→akcja świetlna, #721) — GET/POST/PATCH/DELETE, tenant-scoped, limit 50/portal |
| `…/api/admin/govee-test` | admin | POST — jednorazowy widoczny test lampki Govee portalu (błyśnij zielonym→biały) by sprawdzić creds+urządzenie (#725) |
| `…/api/admin/overlay-token` | admin | Token overlayów (do podglądów) |
| `…/api/admin/overlay-scenes` | admin | CRUD scen overlay (#550 — wiele widżetów na jednym płótnie → jedno źródło OBS `/overlay/scene/<id>`) |
| `…/api/admin/2fa` | admin | Enrollment/zarządzanie TOTP bieżącego admina (step-up dla wrażliwych akcji, #490) |
| `…/api/admin/payment-methods` | admin | CRUD metod wsparcia/napiwków na `/support` (link/krypto/IBAN, #514) |
| `…/api/admin/sound-rewards` | admin | CRUD katalogu GT-dźwięków (widz wykupuje na `/sounds`, #505) |
| `…/api/admin/trivia` | admin | CRUD pytań trivia + runda live na overlayu (#523/#524) |
| `…/api/admin/clan-wars` | admin | Wojny klanów — start/koniec/punkty/pula (#477) |
| `…/api/admin/economy-health` | admin | Analityka ekonomii — mint/burn wg powodu + trend dzienny + top earners/spenders (#525) |
| `…/api/admin/community` | admin | Statystyki społeczności (top Ghost Companions itd., tylko odczyt) |
| `…/api/admin/recap` | admin + plan `ai` | AI Stream Recap — generuje podsumowanie streamu i opcjonalnie wysyła na Discord (#516) |
| `…/api/admin/clip-director` | admin | AI Clip Director — konfiguracja auto-klipów z hype'u czatu + ostatnie klipy (#517) |
| `…/api/admin/section-data` | admin/perm | Lazy-dane sekcji panelu (`?s=<sekcja>`) |
| `…/api/admin/twitch-streamer-auth` (+callback) · `twitch-eventsub` | admin | Autoryzacja streamera Twitch + subskrypcje EventSub |
| `…/api/admin/kick-streamer-auth` (+callback) · `kick-events` | admin | Autoryzacja streamera Kick + eventy |
| `…/api/admin/youtube-streamer-auth` (+callback) | admin | Autoryzacja konta YouTube |

### SaaS — właściciel platformy (`requirePlatformOwner`)
> „Admin-of-admins" — tylko właściciel platformy (nie admin pojedynczego tenanta). Tworzenie i zarządzanie portalami najemców.

| Trasa | Metoda | Po co |
|---|---|---|
| `…/api/admin/tenants` | GET/POST | Lista + provisioning tenantów (slug/nazwa/owner/plan) |
| `…/api/admin/tenants/[id]` | PATCH | Edycja tenanta (branding, plan, wygaśnięcie) |
| `…/api/admin/backfill-tenant` | admin GET/POST | Backfill `tenantId` na istniejących rekordach (migracja na multi-tenant) |

## Bot (botSecret) — bot czatu pobiera konfigurację
| Trasa | Po co |
|---|---|
| `…/api/bot/config` | Parametry nagród (message/voice) |
| `…/api/bot/chat-commands` · `chat-timers` · `faq` · `welcome` | Komendy / timery / FAQ / powitania |
| `…/api/bot/moderation` | Konfiguracja automod (reguły + akcje) |
| `…/api/bot/active-prediction` | Otwarty zakład do re-anonsu na czacie (tylko `announceToChat`) |
| `…/api/bot/ai-reply` · `…/api/bot/imagine` | AI: odpowiedź `@bot` + generowanie obrazka `!imagine` (klucz server-side) |
| `…/api/bot/gt-game` | Mini-gra GT (`!slots` / `!coinflip`) — atomowa gra, zwraca gotową wiadomość |
| `…/api/bot/duel` | Pojedynki PvP (`!duel` / `!accept` / `!decline`) — atomowy transfer puli, zwraca wiadomość |
| `…/api/bot/heist` | Napad kooperacyjny (`!heist` — join/resolve) — escrow przy dołączeniu + atomowa wypłata, scheduler rozliczenia po stronie bota |

## Internal (botSecret) — boty wysyłają zdarzenia
> Trasy `award` + `link-discord` (Discord) woła teraz **E-Bot** (osobne repo `Gh0s777tt/E-Bot`); `chat-award`/`chat-feed`/`song-request`/`mod-violation` — `ghost-empire-chat`. Kontrakt niezmieniony (dawny `ghost-empire-bot` zastąpiony).

| Trasa | Po co |
|---|---|
| `…/api/internal/award` | Nagroda GT (Discord: wiadomości/voice) — wołane przez E-Bot |
| `…/api/internal/chat-award` | Nagroda GT + heatmapa (czat Twitch/Kick/YT) |
| `…/api/internal/chat-feed` | Push wiadomości do overlaya czatu |
| `…/api/internal/song-request` | Dodanie utworu do kolejki `!sr` |
| `…/api/internal/link-discord` | Powiązanie konta Discord kodem |
| `…/api/internal/link-status` | GET — czy dany Discord ID jest powiązany z kontem (E-Bot) |
| `…/api/internal/mod-violation` | Log naruszenia automod (po egzekucji) — statystyki + eskalacja |
| `…/api/internal/emoji-combo` | POST — bot zgłasza wykryty emoji-combo |
| `…/api/internal/raffle-entry` | POST — bot zgłasza trafienie słowa-klucza rafli; wpis darmowy, sub/mod = więcej biletów (#611) |

## Źródła OBS (overlayToken, odczyt)
> **Transport realtime (#189/#190):** każdy overlay łączy się najpierw przez **SSE** (push), a przy dowolnym problemie spada na **polling** (fallback) — payload identyczny, bo overlay i fallback dzielą te same producery (`lib/overlay-feeds`; alerty: `lib/alert-feed`). Klient: hook `lib/use-overlay-stream`.

| Trasa | Overlay / rola |
|---|---|
| `…/api/overlay/stream/[feed]` | **Generyczny SSE** dla overlayów — `feed` ∈ `goals` · `subathon` · `polls` · `predictions` · `recent-events` · `emoji-combo` · `rumble` · `wheel` · `widget` · `chat` · `viewers` (push, heartbeat, self-close 50 s) |
| `…/api/alerts/stream` | `/overlay` (alerty) — dedykowany **SSE** (push, heartbeat, self-close 50 s) |
| `…/api/alerts/queue` | `/overlay` (alerty) — polling **fallback** |
| `…/api/alerts/<feed>` | polling **fallback** pozostałych overlayów (`goals`/`chat`/`subathon`/`wheel`/`rumble`/`polls`/`predictions`/`recent-events`/`emoji-combo`/`widget`/`viewers`) — ten sam payload co SSE |
| `…/api/chat/assets` | `/overlay/chat` (odznaki Twitch + emotki 7TV/BTTV/FFZ) |
| `…/api/obs-control/config` | **`/overlay/obs-control`** (aktuator OBS, #672) — OBS WS url+hasło (deszyfr.) + aktywne reguły event→akcja; `no-store` |
| `…/api/chat/translate` | POST — tłumaczenie AI wiadomości czatu (#547, overlay `?translate=`, rate-limit + cache, uśpione bez klucza AI) |
| `…/api/codes/current` | `/overlay/codes` (rotacja kodów — bez SSE) |

## Webhooki / polling / cron (public + własny podpis)
| Trasa | Po co |
|---|---|
| `…/api/webhooks/twitch-eventsub` | EventSub Twitch (HMAC podpis) — suby/gifty/bity |
| `…/api/webhooks/kick-events` | Webhooki Kick — suby/gifty |
| `…/api/webhooks/paymedia` | Webhook płatności PayMedia (sekret) |
| `…/api/webhooks/stripe` | Webhook Stripe (podpis `STRIPE_WEBHOOK_SECRET`) — aktywacja/odnowienie/wygaśnięcie planu tenanta |
| `…/api/yt/poll-live-chat` | Polling YouTube Live Chat (super chaty / membery) |
| `…/api/cron/streamlabs-poll` | Cron (Vercel) — polling donacji Streamlabs (`CRON_SECRET`) |
| `…/api/cron/prune` | Cron (Vercel, 04:00) — czyszczenie starych rekordów transientowych + **auto-wygasanie bounty ze zwrotem** (#681); `CRON_SECRET` |
| `…/api/cron/weekly-rewards` | Cron (Vercel, pon.) — tygodniowe nagrody GT + **miesięczne rozliczenie Ligi Typerów** (idempotentne, #682); `CRON_SECRET` |
| `…/api/cron/backup` | Cron (Vercel, 05:00) — off-site backup JSON → bucket S3-compatible (R2/B2/S3); **dormant** bez `BACKUP_S3_*` (`CRON_SECRET`, #677) |

## Public / serwisowe (bez auth)
| Trasa | Metoda | Po co |
|---|---|---|
| `…/api/health` | GET | Health-check (200 OK / 503 gdy baza nieosiągalna) |
| `…/api/live-status` | GET | Publiczny, cache'owany status „czy streamer jest live?" do bannera home (#500 — Twitch Helix, współdzielony z overlayem widzów) |
| `…/api/support/click` | POST | Licznik klików metody wsparcia (#541 — beacon z `/support`, rate-limit per IP) |
| `…/api/og` | GET | Dynamiczny OG-image (per tenant: branding/nazwa) |
| `…/api/telemetry/client-error` | POST | Sink błędów klienta (Sentry-lite, rate-limit per IP, nic nie zapisuje w DB) |

---

> Helpery auth: `requireAdmin()`, `requirePermission(p)`, `requirePlatformOwner()` (`@/lib/admin`), `verifyBotSecret()` (`@/lib/utils`), `isValidOverlayToken()` (`@/lib/alerts`). Bramki planu (SaaS): `requireTenantFeature(f)` / `featureGateResponse(f)` (`@/lib/entitlements`) — 403 gdy plan tenanta nie obejmuje funkcji. Uprawnienia moderatora: patrz [PERMISSIONS.md](../PERMISSIONS.md).
