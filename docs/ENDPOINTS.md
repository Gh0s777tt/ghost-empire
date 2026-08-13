# 🌐 ENDPOINTS.md — API portalu

Spis tras API (`ghost-empire-web/src/app/api/**`), pogrupowany wg modelu autoryzacji. Skróty:

- **session** — wymaga zalogowanego usera (NextAuth)
- **admin** — `requireAdmin()` (pełny admin)
- **perm:X** — `requirePermission("X")` (admin LUB moderator z uprawnieniem X)
- **botSecret** — `Authorization: Bearer <sekret>` (boty). Akceptowany **globalny `BOT_SECRET`** (bot first-party, back-compat) **LUB** per-portalowy `Tenant.botSecret` (`verifyBotSecretForTenant`). Tenant jest rozwiązywany z **Hosta** requestu (`getCurrentTenantBotAuth`, nigdy z podrabialnego `x-tenant-slug`), a lookup `User`/`Connection` na trasach money/tożsamości jest **scope'owany do tego tenanta** — bot portalu może ruszać tylko własnych widzów. Wyjątek: `yt/poll-live-chat` to platformowy cron omiatający wszystkie portale → auth pozostaje globalny, ale match darczyńcy YT jest scope'owany do portalu strumienia. Bot = jeden proces/portal (`BOT_SECRET` per-instancja), więc tenant odpala własnego bota ustawiając `BOT_SECRET=<Tenant.botSecret>` — bez zmian w kodzie bota.
- **overlayToken** — `?token=<OVERLAY_TOKEN>` (źródła OBS, tylko odczyt)
- **public** — bez auth (lub własny podpis/sekret)

---

## 🆕 Nowe trasy — Studio (2026-06) — łącznie **225** tras (224× `route.ts` + 1× `route.tsx`)

<!-- Licznik przeliczany, nie przepisywany: `find ghost-empire-web/src/app/api -type f -name "route.*" | wc -l`
     (osobno `-name "route.ts"` = 220 i `-name "route.tsx"` = 1). Stał na 193 długo po tym, jak
     realny stan dobił 221 — a ten plik jest jedyną mapą powierzchni API, więc zaniżony licznik
     czyta się jako „wszystko jest tu opisane", kiedy 28 tras nie było. -->


**Admin (`requireAdmin`):**
| Trasa | Po co |
|---|---|
| `…/api/admin/moderation` | Config automoda (przekleństwa/CAPS/długość/flood/zalgo + akcje) |
| `…/api/admin/integrations` | Klucze API funkcji (AI / Sentry / OBS) — zapis w bazie, maskowane |
| `…/api/admin/setup-status` | Checklista konfiguracji + dane Setup Wizarda (#737) — GET: kroki (wyprowadzane z realnej konfiguracji) + `progress` + `autoOpen` + flagi tenanta; POST `{action: complete\|dismiss\|reopen}` zapisuje stan kreatora |
| `…/api/admin/backup` | Pobranie backupu JSON (config/katalog/salda, bez sekretów) |
| `…/api/admin/widgets` | CRUD własnych widgetów (generator) |

**Bot / internal** *(klasa auth jest w komórce — te dwie trasy `bot/*` są **public GET**, nie `botSecret`; pełny podział 7 public / 6 `botSecret` w sekcji „Bot" niżej)*:
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
| `…/api/shop/buy` | POST | Zakup przedmiotu (sprawdza wymagania: level/sub/mc/osiągnięcie). Waluta wg `ShopItem.currency`: `GT` → tokeny + `totalSpent`, `CHIPS` → żetony (darmowe, poza ekonomią GT). **Fail-closed:** item `CHIPS` spoza `category:"cosmetic"` = **410** + log (nie da się kupić rzeczy o wartości rynkowej za żetony). **Idempotencja (`lib/idempotency`):** double-click/retry tego samego zakupu → **409** (Redis `SET NX PX`; klucz = header `Idempotency-Key` albo hash body; fail-open bez Redisa) |
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
| `…/api/notifications` | GET/POST | Lista / oznaczanie powiadomień. **Jedyny czytnik tabeli `Notification`** — rozwiązuje markery `%gt%`/`%tokenName%` z zapisanego tekstu na walutę portalu (`applyTokenBranding`). Pisarze powiadomień **muszą** zapisywać marker, nie literał: wiersz trwa w bazie, więc rozwiązanie przy zapisie zamroziłoby walutę założyciela w historii obcych portali |
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
| `…/api/gift` | POST | Prezent GT między widzami (#553 — atomowy transfer, limity 5k/transfer + 10k/24h, powiadomienie). **Idempotencja (`lib/idempotency`):** duplikat (ten sam odbiorca+kwota w oknie) → **409**; zwalniana przy insufficient/daily/error, trzymana przy sukcesie |
| `…/api/titles` | GET/POST | Tytuły profilu (#761 — kosmetyczny GT sink): GET katalog + posiadane/założony + saldo; POST `buy` (atomowy spend, `FOR UPDATE`) / `equip` (załóż/zdejmij posiadany) |
| `…/api/auctions` | GET (public)/POST | Dom aukcyjny GT (#762 — realny GT sink): GET lista aukcji portalu (leniwe rozliczanie wygasłych) + saldo/flagi licytującego; POST `bid` (atomowy escrow — trzyma GT, zwraca przebitemu, `FOR UPDATE`) / admin `create`/`cancel` |
| `…/api/search/users` | **public** (rate-limit) | Szukanie widzów do palety poleceń (#549 — **bez logowania**, tylko publiczne pola, tenant-scoped, rate-limit per IP, min 2 znaki) |
| `…/api/search/semantic` | **public** (rate-limit) | Semantic search po znaczeniu (#554 — **bez logowania**, embeddingi AI + cosine, rate-limit per IP; uśpione bez klucza OpenAI) |
| `…/api/profile/social-click` | POST | Licznik klików linku społ. (#542 — beacon z `/u/<nick>`, rate-limit per IP) |
| `…/api/auth/passkey` | GET/DELETE | Lista / usunięcie passkeys użytkownika (#543) |
| `…/api/auth/passkey/register/options` · `…/verify` | POST | Ceremonia rejestracji passkey (WebAuthn, #543) |
| `…/api/auth/passkey/login/options` · `…/verify` | POST | Logowanie passkey (#544 — bez auth; verify tworzy sesję DB + cookie) |
| `…/api/clans` | GET/POST | Klany/drużyny — mój klan + ranking skarbca (GET); POST = utwórz / dołącz / opuść / wpłać GT (#477) |
| `…/api/clips` | GET/POST | Klip tygodnia — klipy + liczby głosów + mój głos (GET publiczne); POST = głos (1/tydzień ISO, #502) |
| `…/api/companion` | GET/PATCH/OPTIONS | Ghost Companion usera (create-on-read); PATCH = zmiana nazwy. **GET** przyjmuje sesję LUB bearer-token companiona (`Authorization: Bearer …`) — rozszerzenie czyta saldo cross-origin; CORS, tylko dane właściciela tokenu |
| `…/api/presence` | GET/POST | Obecność na portalu (#767) — GET publiczny snapshot (online + próbka userów); POST heartbeat (zalogowany `u:<id>` server-side, gość `a:<anonId>` hex-walidowany). Dormant bez Upstash Redis (`{active:false}`) |
| `…/api/companion/feed` | POST | Karmienie companiona GT (osobny endpoint akcji) |
| `…/api/companion/tasks` | GET/OPTIONS | **Read-only** dzienne questy usera na dziś (`{date, tasks:[{id,text,textEn,target,reward,bonusReward,progress,done,claimed}], claimable}`); sesja LUB bearer-token companiona (== tenant), CORS, **nie tworzy** wierszy UserTask (w przeciwieństwie do strony /quests) |
| `…/api/companion/tasks/claim` | POST/OPTIONS | 💰 **ŚCIEŻKA PIENIĘŻNA — jedyny zapis kredytujący GT w powierzchni companiona.** Odbiór nagrody za dziennego questa z rozszerzenia `nx-companion` (wołane **cross-origin**, stąd CORS + `OPTIONS`). Auth: sesja **LUB** bearer-token companiona, i token musi być **tego** tenanta (`payload.tenantId === tid`) — quest obcego portalu zwraca **404**, nie 403, żeby nie potwierdzać istnienia cudzych wierszy. Rate-limit 20/min/user. Kredyt jest atomowy: `updateMany` z guardem `claimed:false` **wewnątrz** transakcji, `count === 0` ⇒ rollback zamiast podwójnego creditu; `Transaction` typu `earn` + `tokens`/`totalEarned` rosną w tej samej transakcji. Świadome **lustro** `…/api/tasks/claim` (portal UI) — żywej ścieżki pieniężnej celowo nie refaktoryzowano, zmiana była addytywna. ⚠️ Sąsiedni `…/api/companion/tasks` jest **read-only**, i dopóki tego wiersza tu nie było, czytelnik wyciągał z tego wniosek, że powierzchnia companiona nie mintuje. **Mintuje.** |
| `…/api/companion/season` | GET/OPTIONS | **Read-only** aktywny sezon + postęp usera (`{season:{number,name,totalTiers,xpPerTier,endsAt}\|null, progress:{xp,tier,premium,xpIntoTier,xpToNextTier}}`); sesja LUB bearer-token, CORS, **nie tworzy** sezonu (create-on-read pominięte) |
| `…/api/assistant` | session + plan `ai` | Asystent pomocy („?" na każdej stronie) — wymaga zalogowania; degraduje się gdy brak planu/klucza AI |
| `…/api/trivia` | GET/POST | Trivia/quiz (widz, #523) — aktywne pytania + moje odpowiedzi; POST = odpowiedź za GT (poprawna ukryta do czasu) |
| `…/api/sound-rewards` | GET/POST | GT→dźwięki (widz, #505) — aktywny katalog + saldo; POST = wykup dźwięku (atomowy spend → alert) |
| `…/api/referral` | GET/POST | Referrals (#501) — mój kod + statystyki + czy odebrałem; POST = odbiór kodu znajomego (oboje GT) |
| `…/api/watch-streak` | GET/POST | Watch Streaks (#687) — passa dni oglądania: GET status, POST zalicza dzień (rate-limited, idempotentne per UTC-dzień) |
| `…/api/portals` | GET/POST/DELETE | Hub „przełącz portale" (#508) — portale, które obserwuję; POST follow, DELETE unfollow |
| `…/api/getting-started` | GET | Flagi ukończenia checklisty „Pierwsze kroki" na home (#503 — tylko odczyt) |

## Kasyno GT (`gt-games`) — session, bramka planu `casino`
> Mini-gry na stronie (`/kasyno`). **Waluta: żetony (`chips`)** — darmowe, niekupowalne (de-ryzykowanie prawne, `docs/CHIPS-CASINO.md`), NIE Ghost Tokens. Akcje gry: **session** + `featureGate("casino")` (403 gdy plan tenanta < pro). Odczyty puli/rankingu — **public**.

| Trasa | Metoda | Po co |
|---|---|---|
| `…/api/gt-games/play` | POST | Gry jednorzutowe (`slots`/`coinflip`/`roulette`) — atomowy zakład, zwraca wynik |
| `…/api/gt-games/blackjack/start` · `hit` · `stand` · `double` | POST | Blackjack — rozdanie + ruchy (stan partii server-side) |
| `…/api/gt-games/hilo/start` · `guess` · `cashout` | POST | Hi-Lo — start, zgadywanie wyżej/niżej, wypłata mnożnika |
| `…/api/gt-games/mines/start` · `reveal` · `cashout` | POST | Mines — start, odkrywanie pól, wypłata |
| `…/api/gt-games/history` | GET | Historia rozgrań usera |
| `…/api/gt-games/jackpot` | GET | **public** — stan progresywnego jackpota (seed + Redis, pula żetonowa) |
| `…/api/casino/daily-chips` | GET/POST | **Darmowe żetony kasyna** — 500/dzień (stan + odbiór, idempotentne per-dzień jak daily-bonus). Źródło waluty `chips` — patrz `docs/CHIPS-CASINO.md` |
| `…/api/gt-games/leaderboard` | GET | **public** — największe wygrane + top netto (30 dni, scope per tenant) |

## Onboarding / Billing (SaaS) — session
| Trasa | Metoda | Po co |
|---|---|---|
| `…/api/onboarding` | POST | Provisioning portalu tenanta przy zakładaniu konta (slug/nazwa/branding) |
| `…/api/onboarding/my` | GET/PATCH | Stan i edycja onboardingu/brandingu własnego tenanta |
| `…/api/billing/checkout` | GET/POST | Status billingu (GET `{configured}`) / utworzenie Stripe Checkout (POST `{plan,months,currency}` — wielowaluta przez `currency_options`, trial 14 dni, #744). Gdy Stripe nieskonfigurowany → 503 (trial bez karty) |
| `…/api/billing/portal` | POST | Stripe Customer Portal dla własnego tenanta — samodzielne faktury/karta/anulowanie. 400 przed pierwszym checkoutem (brak customer), 503 gdy Stripe nieskonfigurowany |

## Admin
| Trasa | Auth | Po co |
|---|---|---|
| `…/api/admin/grant-tokens` | perm:grant_tokens | +/- saldo userowi w wybranej walucie: `currency: "GT"` (domyślnie — rusza `tokens` + `totalEarned`/`totalSpent`, karmi detektor anomalii) albo `"CHIPS"` (**tylko** `chips` — zero liczników GT, zero anomaly-checka; darmowa waluta kasyna). Nieznana waluta → **400**. Step-up 2FA od ±10 000 dla obu walut |
| `…/api/admin/push` | admin | GET licznik subskrybentów + status; POST broadcast web push do subskrybentów portalu (#537) |
| `…/api/admin/sponsors` | admin | CRUD sponsorów/partnerów portalu (pasek na `/support`, #538) |
| `…/api/admin/user-roles` | admin | Role: admin / moderator / donator |
| `…/api/admin/connection-roles` | perm:mark_subs | GET aktualny status (prefill karty) + POST zapis sub/mod/VIP per platforma; GET dodany w #765, by zapis nie nadpisywał nietkniętych flag |
| `…/api/admin/reset-database` | platform-owner | **Reset bazy** (#741) — `scope: all` (wszystkie portale, fraza „USUŃ WSZYSTKO") lub `scope: tenant`+`tenantId` (jeden portal, fraza = slug portalu). Tylko owner + step-up 2FA (failClosed) |
| `…/api/admin/shop` | perm:manage_shop | CRUD sklepu. `currency` zapisywalne (`GT` \| `CHIPS`, domyślnie `GT`; nieznana wartość → **400**). **Inwariant CHIPS ⇒ `category:"cosmetic"`** (`lib/shop-currency.ts`) wymuszany na POST i PATCH — walidowany jest *wynikowy* stan itemu, więc sam PATCH `category` na istniejącym itemie za żetony też dostaje **400**; równoległa edycja drugiej połowy pary → **409** (odśwież) |
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
| `…/api/upload` | admin | `POST` multipart — upload mediów (tło/alerty/sceny) do Supabase Storage, per-tenant prefix; zwraca publiczny URL. Magic-bytes allowlist (SVG wykluczony), cap 20 MB, rate-limit. 503 bez `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/bucketa |
| `…/api/admin/donations` | admin | Donacje: `GET` statystyki (suma PLN/liczba/per-provider, tenant-scoped) + `PATCH` dopasowanie/skip |
| `…/api/admin/streamlabs` | admin | Stan połączenia Streamlabs |
| `…/api/admin/subathon` | admin | Subathon (start/stop/±czas) |
| `…/api/admin/welcome` · `chat-commands` · `chat-timers` · `faq` · `song-requests` | admin | Konfiguracja bota czatu |
| `…/api/admin/schedule` | perm:manage_shop | Harmonogram streamów |
| `…/api/admin/bot-config` | perm:manage_shop | Config bota Discord |
| `…/api/admin/bot-status` | perm:manage_shop | Status żywotności bota czatu (online/lastSeen/platformy) z heartbeatu |
| `…/api/admin/bot-secret` | admin (owner portalu) | Własny sekret bota portalu (`Tenant.botSecret`) — GET `{configured, hint, slug, name, globalFallback}` (**nigdy sama wartość**; `hint` = 4 ostatnie znaki), POST `{action:"rotate"}` → mintuje `randomToken(32)` i **pokazuje go dokładnie raz**, POST `{action:"clear"}` → powrót do globalnego `BOT_SECRET`. Bramka `canManageTenantBotSecret` (właściciel portalu / admin tego portalu / właściciel platformy — **nie** admin z `tenantId=NULL`), step-up 2FA, limit 10/5min, audit `rotate_bot_secret` bez wartości. Szczegóły: [PER-TENANT-IDENTITY §9](PER-TENANT-IDENTITY.md#10-per-tenant-bot-identity-tenantbotsecret) |
| `…/api/admin/streamdeck-token` | admin (owner portalu) | Token Stream Deck / Companion portalu (`Tenant.streamDeckToken`) — GET `{configured, hint, slug, name}` (**nigdy sama wartość**), POST `{action:"rotate"}` → mintuje `randomToken(32)` i **pokazuje go dokładnie raz**, POST `{action:"clear"}` → wyłącza wyzwalanie. Bramka `canManageTenantBotSecret` (jak bot-secret), limit 10/5min, audit `rotate_streamdeck_token` bez wartości. **Bez step-up 2FA** — zakres wąski (tylko overlay-alerty, zero ekonomii). Konsumowany przez `…/api/streamdeck/trigger` (sekcja „Stream Deck / Companion"). |
| `…/api/admin/ban-user` | perm:ban_users | Ban/mute |
| `…/api/admin/merge-users` | admin | Scalanie duplikatów kont |
| `…/api/admin/support-tickets` | admin | Skrzynka wsparcia — GET lista (filtr open/resolved/all, tenant-scoped), PATCH reply/resolve/reopen + powiadomienie widza (#650) |
| `…/api/admin/deliver-order` | perm:deliver_orders | Realizacja zamówień sklepu |
| `…/api/admin/analytics` | admin | Heatmapa aktywności czatu |
| `…/api/admin/analytics-charts` | admin | Wykresy wzrostu (#769) — nowi/dzień 30d, przepływ GT/dzień, retencja kohort 8 tyg. (read-only, tenant-scoped) |
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
| `…/api/admin/payment-methods` | admin | CRUD metod wsparcia/napiwków na `/support` (link/krypto/IBAN, #514) + cel zbiórki (`save-goal`) + konfigurowalny tekst strony (`save-support-text`: nagłówek/opis/dziękuję, #742) |
| `…/api/admin/sound-rewards` | admin | CRUD katalogu GT-dźwięków (widz wykupuje na `/sounds`, #505) |
| `…/api/admin/trivia` | admin | CRUD pytań trivia + runda live na overlayu (#523/#524) |
| `…/api/admin/clan-wars` | admin | Wojny klanów — start/koniec/punkty/pula (#477) |
| `…/api/admin/casino-config` | admin | GET/PATCH ekonomii kasyna dla portalu — dziś `dailyChipsAmount` (darmowy dzienny grant żetonów, widełki 50–100 000; nieliczbowa wartość → **400**, poza widełkami → przycięcie). Audytowane (`update_casino_config`) |
| `…/api/admin/economy-health` | admin | Analityka ekonomii — mint/burn wg powodu + trend dzienny + top earners/spenders (#525). **Dwa obiegi osobno:** blok główny = realne GT, blok `chips` = żetony (obieg/mint/burn/health + top źródła i spusty). `currency` jest **kluczem `groupBy`**, nie filtrem, więc druga waluta nie kosztuje ani jednego zapytania więcej; trend i top-userzy zostają GT-only |
| `…/api/admin/community` | admin | Statystyki społeczności (top Ghost Companions itd., tylko odczyt) |
| `…/api/admin/recap` | admin + plan `ai` | AI Stream Recap — generuje podsumowanie streamu i opcjonalnie wysyła na Discord (#516) |
| `…/api/admin/clip-director` | admin | AI Clip Director — konfiguracja auto-klipów z hype'u czatu + ostatnie klipy (#517) |
| `…/api/admin/section-data` | admin/perm | Lazy-dane sekcji panelu (`?s=<sekcja>`) |
| `…/api/admin/twitch-streamer-auth` (+callback) · `twitch-eventsub` | admin | Autoryzacja streamera Twitch + subskrypcje EventSub (**EventSub chodzi na tokenie *aplikacji*** — wiersz streamera daje tam tylko `broadcasterId`) |
| `…/api/admin/kick-streamer-auth` (+callback) · `kick-events` | admin | Autoryzacja streamera Kick + eventy. `kick-events` wymaga tokenu **streamera** (Kick nie pozwala zakładać/kasować subskrypcji tokenem aplikacji), więc odświeża go sam przez `getValidKickAccessToken`; gdy się nie da → `400` + `authCode` (`reauth_required` = przeklikaj „Autoryzuj Kick", `refresh_failed` = przejściowe) |
| `…/api/admin/youtube-streamer-auth` (+callback) | admin | Autoryzacja konta YouTube |
| `…/api/admin/rumble` | admin | Per-portal Rumble (#730) — GET status na żywo + `hasUrl`, POST zapis/wyczyść `rumbleApiUrl` (szyfrowany), tenant-scoped, audit-logged |
| `…/api/admin/role-roster` | admin | Lista posiadaczy ról/rang portalu (#700) — odczyt do panelu Role |
| `…/api/admin/subscribers` | admin | Subskrybenci portalu (#701) — lista + statusy do sekcji Subskrybenci |

### SaaS — właściciel platformy (`requirePlatformOwner`)
> „Admin-of-admins" — tylko właściciel platformy (nie admin pojedynczego tenanta). Tworzenie i zarządzanie portalami najemców.

| Trasa | Metoda | Po co |
|---|---|---|
| `…/api/admin/tenants` | GET/POST | Lista + provisioning tenantów (slug/nazwa/owner/plan) |
| `…/api/admin/tenants/[id]` | PATCH | Edycja tenanta (branding, plan, wygaśnięcie) |
| `…/api/admin/backfill-tenant` | admin GET/POST | Backfill `tenantId` na istniejących rekordach (migracja na multi-tenant) |

## Bot — bot czatu pobiera konfigurację i gra
> ⚠️ **Ta sekcja ma DWIE klasy auth, nie jedną.** Z 13 tras `…/api/bot/*` **7 to `public` GET**
> (żadna nie woła `verifyBotSecretForTenant`; nagłówek każdego z tych plików mówi wprost
> „PUBLIC GET"), a **6 wymaga `botSecret`**. Nagłówek obiecywał wcześniej `botSecret` dla wszystkich
> 13: `moderation` i `active-prediction` były już poprawnie opisane jako public GET wyżej (sekcja
> „Nowe trasy — Studio"), a `config`/`chat-commands`/`chat-timers`/`faq`/`welcome` po prostu nigdy
> nie zostały przeklasyfikowane. Weryfikacja jednym poleceniem:
> `grep -L verifyBotSecretForTenant ghost-empire-web/src/app/api/bot/*/route.ts`.
>
> **Ta publiczna powierzchnia jest ŚWIADOMA, nie luką do „naprawienia".** Bot czatu nie ma sesji, a
> portal bez własnego `Tenant.botSecret` rozwiązuje tenanta wyłącznie z `Host` — dokładnie ta sama
> sytuacja co `…/api/companion/branding` niżej, który z tego samego powodu **musi zostać publiczny**.
> Koszt jest realny i przyjęty świadomie: kto zna `Host` portalu, odczyta jego strojenie ekonomii
> (`messageReward`, `voiceRewardPerMinute`, cooldowny), pełną listę komend, timery, FAQ i powitania.
> Zero zapisu, zero sekretów, zero PII w odpowiedzi — to konfiguracja, którą widz i tak widzi na
> czacie. **Dołożenie tu auth cichaczem zrzuci z konfiguracji każdego wdrożonego bota** (fetch
> zwróci 401, bot zostanie na fallbacku/pustej liście komend), więc taka zmiana to skoordynowane
> wydanie portalu **i** bota, nie jednolinijkowiec w `route.ts`.

**`public` (GET, bez auth) — 7 tras:**
| Trasa | Po co |
|---|---|
| `…/api/bot/config` | public GET — parametry nagród (message/voice) + cooldowny; defaulty gdy brak wiersza w bazie |
| `…/api/bot/chat-commands` | public GET — włączone komendy + status live (do warunkowych `requiresLive` / `activeFromMinute`, żeby bot nie odpytywał Twitcha sam) |
| `…/api/bot/chat-timers` | public GET — włączone timery cykliczne |
| `…/api/bot/faq` | public GET — auto-odpowiedzi FAQ (dopasowanie po słowie kluczowym) |
| `…/api/bot/welcome` | public GET — konfiguracja powitań |
| `…/api/bot/moderation` | public GET — konfiguracja automod (reguły + akcje) |
| `…/api/bot/active-prediction` | public GET — otwarty zakład do re-anonsu na czacie (tylko `announceToChat`) |

**`botSecret` (`verifyBotSecretForTenant`) — 6 tras:**
| Trasa | Po co |
|---|---|
| `…/api/bot/ai-reply` · `…/api/bot/imagine` | AI: odpowiedź `@bot` + generowanie obrazka `!imagine` (klucz server-side) |
| `…/api/bot/gt-game` | Mini-gra GT (`!slots` / `!coinflip`) — atomowa gra, zwraca gotową wiadomość |
| `…/api/bot/duel` | Pojedynki PvP (`!duel` / `!accept` / `!decline`) — atomowy transfer puli, zwraca wiadomość |
| `…/api/bot/heist` | Napad kooperacyjny (`!heist` — join/resolve) — escrow przy dołączeniu + atomowa wypłata, scheduler rozliczenia po stronie bota |
| `…/api/bot/heartbeat` | Ping żywotności bota (co ~60 s, `{platforms}`) — zapis per tenant w Redis; odczyt: `…/api/admin/bot-status` |

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

## Stream Deck / Companion (streamDeckToken) — wyzwalanie akcji
> Fizyczny Stream Deck / Bitfocus Companion woła to **generyczną akcją HTTP POST** z nagłówkiem `Authorization: Bearer <token>` (token z `…/api/admin/streamdeck-token`, pokazany raz). Auth: per-tenant `Tenant.streamDeckToken` (`verifyStreamDeckTokenForTenant` — **bez** globalnego master-key, inaczej niż `botSecret`; portal ze swoim tokenem to jedyny klucz), tenant z Hosta, rate-limit 60/min per portal. Zakres **wąski**: tylko enqueue overlay-alertów, zero ekonomii/admina — wyciek tokenu z pulpitu ogranicza się do overlayu jednego portalu.

| Trasa | Po co |
|---|---|
| `…/api/streamdeck/trigger` | POST `{action:"test"}` → wbudowany test-alert (jak przycisk „Test alert" w panelu Alerty); POST `{action:"custom_fire", id}` → odpala zapisany Custom Alert (`type:"custom"`, omija filtr enabled). Rozszerzalny `switch` — akcje ekonomii/eventów (drop/draw/goal_reset/subathon) to świadomy późniejszy slice na tym samym tokenie. Zob. [OBS-CONTROL.md](OBS-CONTROL.md). |

## Źródła OBS (overlayToken, odczyt)
> **Transport realtime (#189/#190):** każdy overlay łączy się najpierw przez **SSE** (push), a przy dowolnym problemie spada na **polling** (fallback) — payload identyczny, bo overlay i fallback dzielą te same producery (`lib/overlay-feeds`; alerty: `lib/alert-feed`). Klient: hook `lib/use-overlay-stream`.

| Trasa | Overlay / rola |
|---|---|
| `…/api/overlay/stream/[feed]` | **Generyczny SSE** dla overlayów — `feed` ∈ `goals` · `subathon` · `polls` · `predictions` · `recent-events` · `emoji-combo` · `rumble` · `wheel` · `widget` · `chat` · `viewers` · `presence` (push, heartbeat, self-close 50 s) |
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
| `…/api/cron/streamlabs-poll` | Cron (Vercel, co 15 min) — polling donacji Streamlabs, **per portal** (`CRON_SECRET`). **Tylko produkcja:** na deployu `VERCEL_ENV=preview`/`development` zwraca 200 `{skipped:"non-production-deployment"}` bez pollingu i bez Sentry (fail-open: brak `VERCEL_ENV` = produkcja, patrz [ENV.md](ENV.md)). Awaria któregokolwiek portalu → HTTP 500 + `Sentry.captureMessage` (alert na zastój wpływu) |
| `…/api/admin/hue-rules` | admin | **Reguły Philips Hue** (#817): GET/POST/PATCH/DELETE, tenant-scoped, audytowane, limit 50 reguł. Walidacja w `lib/hue-rules.ts`. ⚠️ Te wiersze **nie są konsumowane po stronie serwera** — inaczej niż Govee, które jest chmurowe. Mostek Hue stoi w LAN streamera, więc reguły są **dowożone do źródła przeglądarkowego w OBS** przez `/api/obs-control/config`; dlatego nic tutaj nie sprawdza poświadczeń, a reguła zapisana przy nieskonfigurowanym mostku jest poprawna, tylko bezczynna. Kolumna `brightness` trzyma **procent** wpisany przez streamera, nie 1–254 mostka — konwersja jest w aktuatorze, żeby panel pokazywał liczbę, którą człowiek wpisał |
| `…/api/admin/penalties` | admin | **Kary** (#806): GET = konfiguracja portalu (włącznik, próg, cooldown) + katalog + 25 ostatnich losowań + limity + ostrzeżenie prawne. POST `saveConfig` · `savePenalty` · `deletePenalty`. Efekt kary walidowany **tymi samymi walidatorami co reguły OBS**; przedziały porządkowane przy zapisie; próg z **podłogą 1 zł**. Zapis konfiguracji przez `findFirst` + jawną gałąź, nie `upsert` — `tenantId` to **nullowalny** unique, a Postgres traktuje NULL-e jako różne. Edycja i usuwanie scope'owane po portalu, więc obce `id` jest no-opem. Włączenie jest audytowane |
| `/api/obs-control/penalties` | overlay-token | Wydaje aktuatorowi w OBS **wylosowane kary, którym nadszedł czas** (#806). **Świadomie NIE feed alertów:** tamten respektuje progi wyświetlania per typ (`AlertTypeConfig.minAmount`), więc alert ukryty przed overlayem nie dotarłby też do aktuatora — a karę ktoś **zapłacił**, więc nie może jej zjeść niepowiązany próg wyświetlania. Zero filtrowania po kwocie. **Dostarczenie jest at-most-once:** wiersz dostaje `appliedAt` w momencie wydania, więc zamknięcie lub odświeżenie źródła przeglądarkowego nie odtworzy efektów, które już poszły. Kosztem jest odwrotna awaria — losowanie wydane źródłu, które padło przed wykonaniem, przepada; to właściwa strona kompromisu, bo zdublowany efekt porywa stream, a pominięty jest widoczny w panelu jako wiersz z `appliedAt` i niczym na ekranie. Wiersz, którego nie da się wykonać (skasowany albo niekompletny wpis katalogu), też jest stemplowany — inaczej byłby wydawany co 2 s w pętli |
| `…/api/cron/donationalerts-poll` | Cron (Vercel, `*/10`) — polling wpłat **DonationAlerts** dla każdego portalu, który połączył konto (`CRON_SECRET`). **Jedyny poll, który może naliczać walutę automatycznie**: wpłaty czytamy upoważnieniem OAuth streamera prosto z API dostawcy, więc zdarzenia dostają `trust:"verified"` i bramka mintu je przepuszcza — o ile w wiadomości jest kod GE-XXXXXX widza i waluta jest znana. Wygasły token → **jedno** odświeżenie i ponowienie (bez kolumny na wygaśnięcie: samo się leczy). Per portal `try/catch`, błąd w `lastError` + Sentry, status 500 gdy którykolwiek portal padł, bramka nie-produkcyjna, brak odtwarzania historii przy pierwszym pollu |
| `…/api/cron/tipply-poll` | Cron (Vercel, `*/15`) — polling wpłat **Tipply** dla każdego portalu, który podłączył widget (`CRON_SECRET`). Tipply nie ma API ani webhooka, więc odpytujemy publiczny endpoint widgetu streamera. Każdy portal w osobnym `try/catch` (jedna zepsuta integracja nie blokuje reszty), błąd ląduje w `lastError` na wierszu integracji **i** w Sentry, a odpowiedź jest **niezerowa (500)**, gdy którykolwiek portal padł — zatrzymana szyna wpłat nie może wyglądać jak „cichy dzień”. Wpłaty są **zawsze `unverified`** → kolejka rekoncyliacji, nigdy automatyczny mint |
| `…/api/cron/prune` | Cron (Vercel, 04:00) — czyszczenie starych rekordów transientowych + **auto-wygasanie bounty ze zwrotem** (#681); `CRON_SECRET` |
| `…/api/cron/weekly-rewards` | Cron (Vercel, pon.) — tygodniowe nagrody GT + **miesięczne rozliczenie Ligi Typerów** (idempotentne, #682); `CRON_SECRET` |
| `…/api/cron/backup` | Cron (Vercel, 05:00) — off-site backup JSON → bucket S3-compatible (R2/B2/S3); **dormant** bez `BACKUP_S3_*` (`CRON_SECRET`, #677) |
| `…/api/cron/weekly-digest` | Cron (Vercel, pon. 07:00) — tygodniowy raport email do właścicieli portali (nowi/GT-flow/top/pending); **dormant** bez `RESEND_API_KEY`+`EMAIL_FROM` (`CRON_SECRET`, #773) |
| `…/api/cron/reconcile-ledger` | Cron (Vercel, 06:00) — **nocny audyt księgi (double-entry)**: dla każdego portalu sprawdza inwariant `Σ salda == Σ Transaction.amount` osobno dla GT i CHIPS (salda z `User.tokens/chips`, ledger z relacji `user`). Rozjazd (niezaksięgowany mint/burn) → `Notification` do adminów **tego** portalu + `Sentry` + HTTP 500; alerty **dedupowane w Redis** (stały baseline alarmuje raz, nie co noc). Czysta logika w `lib/reconcile` (unit-tested). `CRON_SECRET` |

## Public / serwisowe (bez auth)
| Trasa | Metoda | Po co |
|---|---|---|
| `…/api/health` | GET | Health-check (200 OK / 503 gdy baza nieosiągalna) |
| `…/api/discover` | GET/OPTIONS | Publiczne odkrywanie kanał→portal dla rozszerzenia-companiona (`?platform=&channel=` → `{found, slug, name, ownerHandle, portalUrl}`; dopasowanie po `ownerHandle`, CORS `*`, rate-limit per IP, read-only, multi-tenant, zero danych wrażliwych) |
| `…/api/companion/branding` | GET/OPTIONS | Publiczny branding portalu (`{name, tokenName, tokenSymbol, brandColor, logoUrl}` z Hosta; CORS `*`, rate-limit 120/min/IP, read-only). **Dwóch konsumentów:** rozszerzenie-companion **oraz bot czatu** (`ghost-empire-chat/src/branding.ts` cache'uje to z TTL 5 min, by nazwać walutę w wiadomościach na czacie) — **musi zostać publiczny**, bot nie ma sesji; dołożenie auth cichaczem zrzuci czat każdego portalu na neutralne „tokeny" |
| `…/api/companion/token` | POST/OPTIONS | Mint bezstanowego tokenu companiona (session, same-origin przez portal-bridge rozszerzenia) → `{token, expiresInDays:7}`; HMAC-podpisany `{userId, tenantId}` (bez db), CORS |
| `…/api/live-status` | GET | Publiczny, cache'owany status „czy streamer jest live?" do bannera home (#500 — Twitch Helix, współdzielony z overlayem widzów) |
| `…/api/support/click` | POST | Licznik klików metody wsparcia (#541 — beacon z `/support`, rate-limit per IP) |
| `…/api/support/claim` | POST | Zgłoszenie widza „wpłaciłem bez kodu" (#self-claim) — zapisuje **asercję** (kwota/waluta/data/dowód) do `DonationClaim`. **Nic nie kredytuje i nie dopasowuje** (dopasowanie jest po stronie admina); odpowiedź **zawsze identyczna**, żeby nie być oracle'em istnienia cudzych wpłat. Auth + rate-limit 5/h `failClosed` + limit 3 otwartych zgłoszeń; fail-closed przy nierozwiązanym tenancie |
| `…/api/admin/donation-integrations` | GET/POST | **Panel**: podłączanie dostawców donacji do portalu (#donation-layer). GET = lista dostawców + stan integracji (**bez sekretów** — tylko flaga „zapisany”) + ścieżka webhooka. POST `save` (token/on-off) · `rotate` (nowy sekret generycznego webhooka, zwracany **raz**) · `delete`. Tenant-scoped, sekrety szyfrowane; `trust` nadaje **serwer** wg dostawcy — klient nie może podnieść uprawnień do mintu. Włączenie integracji **bez sekretu jest odrzucane** |
| `/api/auth/donationalerts` | admin | Start OAuth DonationAlerts. `state` **podpisany i związany z dostawcą** niesie `{tenantId,userId}` (jedna aplikacja = jeden redirect URI, więc portal nie może wynikać z URL-a), a nonce w ciasteczku wiąże go z tą przeglądarką. Bez `DONATIONALERTS_CLIENT_ID/SECRET` zwraca `da_error=not_configured` zamiast odbijać streamera na stronę błędu dostawcy |
| `/api/auth/donationalerts/callback` | admin | Wymiana kodu na token i zapis grantu na istniejącym wierszu `DonationIntegration` (`tokenEnc` = access, `secretEnc` = refresh) — **bez zmiany schematu**. Brak ciasteczka nonce **nie pomija** wiązania, tylko je oblewa. Grant **bez refresh tokenu jest odrzucany** (inaczej połączenie umarłoby cicho przy pierwszym wygaśnięciu). Audyt zapisuje sam fakt połączenia, nigdy tokenu |
| `/api/webhooks/kofi/[id]` | POST | Wejściowy webhook **Ko-fi**, jeden URL na portal (`[id]` = `DonationIntegration.id`). Streamer wkleja ten URL w swoim panelu Ko-fi i zapisuje u nas token weryfikacyjny; token jest porównywany **timing-safe** i to jest **jedyne** miejsce, gdzie zdarzenie Ko-fi zyskuje prawo mintu. Rate-limit per integracja (+ szerszy per-IP), `failClosed`. Idempotencja przez `Donation.externalId`. Zawsze 404 dla nieistniejącej/wyłączonej integracji |
| `/api/webhooks/custom/[id]` | POST | **Generyczny** webhook donacji — dla narzędzi bez API (buycoffee, Patronite) oraz automatyzacji (Zapier/Make/n8n). Sekret w `Authorization: Bearer` lub `X-Donation-Secret`. Body: `{amount|amountMinor, currency?, donorName?, message?, eventId?, donatedAt?}`. **Zawsze `unverified` → NIGDY nie mintuje**; trafia do istniejącej kolejki rekoncyliacji admina. `externalId` namespace'owany per integracja (blokuje squatting cudzych kluczy idempotencji) |
| _(brak endpointu)_ | — | **Tipply** działa przez cron `tipply-poll`, nie webhook: streamer wkleja w panelu link swojego widgetu `TIP_ALERT`, a my zapisujemy z niego UUID w `DonationIntegration.externalRef` (walidowany przez `parseTipplyWidgetId` — śmieci są odrzucane od razu, żeby nie powstał cron odpytujący nic). Pierwsze odpytanie **nie odtwarza historii**: `tipplySince()` przycina stronę do wpłat od momentu konfiguracji (z limitem 12 h wstecz), inaczej 25 archiwalnych wpłat wpadłoby na overlay i do kolejki |
| `…/api/og` | GET | Dynamiczny OG-image (per tenant: branding/nazwa) |
| `…/api/telemetry/client-error` | POST | Sink błędów klienta (Sentry-lite, rate-limit per IP, nic nie zapisuje w DB) |

---

> Helpery auth: `requireAdmin()`, `requirePermission(p)`, `requirePlatformOwner()` (`@/lib/admin`), `verifyBotSecret()` (`@/lib/utils`), `isValidOverlayToken()` (`@/lib/alerts`). Bramki planu (SaaS): `requireTenantFeature(f)` / `featureGateResponse(f)` (`@/lib/entitlements`) — 403 gdy plan tenanta nie obejmuje funkcji. Uprawnienia moderatora: patrz [PERMISSIONS.md](https://gitlab.com/Gh0s777tt/ghost-empire/-/blob/main/PERMISSIONS.md).
