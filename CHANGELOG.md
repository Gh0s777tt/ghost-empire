# Changelog

Wszystkie istotne zmiany w Ghost Empire są opisane w tym pliku.

Format opiera się na [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Wersje datowane (kalendarzowe) zamiast SemVer — projekt jest aplikacją, nie biblioteką.

## [Unreleased]

(Zmiany na lokalnym branchu `main`, jeszcze nie pushnięte na produkcję.)

### Docs

- **README.md przepisane** jako single source of truth — pełna lista current features (Phase 2 done), setup od zera per OAuth provider, special-case'y dla EventSub/Streamlabs/OBS, link do CHANGELOG/PHASE2/PHASE3.
- **PHASE3.md** dodany — plan stream chat bota (Twitch+Kick+YouTube) + engagement features + hardware integrations + AI, podzielone na 4 sub-fazy (3A foundation, 3B engagement, 3C alerts+hardware, 3D AI+analytics) z realistycznymi estymacjami. Wymaga akceptacji + decyzji priorytetów przed implementacją.

### Added

- **Error boundaries + global error fallback** — `app/error.tsx` (route-level) łapie runtime exception w dowolnym segmencie i pokazuje przyjazny ekran "Coś poszło nie tak" z przyciskiem "Spróbuj ponownie" (`reset()`) zamiast białej strony; `app/global-error.tsx` to last-resort boundary gdy root layout sam rzuci błąd (renderuje własny `<html>/<body>`, inline styles bo globals.css jest wtedy pominięty). Oba logują do konsoli/Vercel logs z `error.digest`.
- **Loading state na nawigacji** — `app/loading.tsx` pokazuje natychmiast brandowany loader (pulsujące logo ducha + "Ładowanie") przy każdej nawigacji do segmentu który jeszcze się renderuje server-side. W parze ze `staleTimes` Router Cache: cache'owane nawigacje są instant, niecache'owane dostają natychmiastowy feedback zamiast pustego ekranu.
- **SEO: robots.txt + sitemap.xml** — `app/robots.ts` generuje `/robots.txt` (allow publiczne, disallow `/admin`, `/api/`, `/overlay`, `/profile`, `/auth/`) + wskazuje sitemap. `app/sitemap.ts` generuje `/sitemap.xml` z 13 publicznymi trasami (home, ranking, shop, events, predictions, drops, quests, seasons, achievements, schedule, about, terms, privacy) z `changeFrequency`/`priority`. Oba prerenderowane statycznie.
- **PWA: ikony + manifest + theme-color** — portal jest teraz instalowalny (Add to Home Screen). `app/icon.svg` (wektorowy favicon: czerwony heksagon + duch, skaluje się do każdego rozmiaru — naprawia 404 na `/favicon.ico`), `app/apple-icon.tsx` (180×180 PNG generowany przez `ImageResponse` dla iOS), `app/manifest.ts` (`/manifest.webmanifest`: standalone display, `theme_color #E50914`, `background_color #0A0A0A`, ikony maskable). `viewport` export w `layout.tsx` ustawia `themeColor` (czerwony pasek adresu na mobile) + `colorScheme: dark`. Wszystkie auto-wstrzykiwane przez Next (bez ręcznych `<link>`).
- **A11y: `prefers-reduced-motion`** — użytkownicy z włączonym systemowym "ogranicz ruch" dostają natychmiastowe przejścia zamiast pulsów/slide'ów/obracającej się ramki (globalny reset w `globals.css`); elementy ze stagger-reveal są wymuszane jako widoczne, żeby nic nie zostało na `opacity:0`.
- **Battle Pass / Sezony** (Phase 3B — największy retention feature). Miesięcznie-rolujące sezony (auto-tworzone przy pierwszym XP-evencie miesiąca przez `getOrCreateCurrentSeason`). Nowe modele: `Season`, `SeasonReward` (per tier, free vs premium track), `UserSeasonProgress` (XP accumulator + computed tier), `UserSeasonRewardClaim` (dedup). `awardSeasonXp(userId, source)` wpięte w 11 źródeł: chat msg (+10), voice min (+20), twitch/kick sub (+500), gift sub (+250/szt), bit (+1), donacja (+10/PLN), drop claim (+50), event won (+500), shop buy (+100), welcome (+1000), prediction win (+200). 30 tierów × 5000 XP, domyślne nagrody tokenowe auto-seedowane co kilka tierów. Strona `/seasons` z paskiem progresu + grid nagród (claimed/locked/available/premium-locked states). Admin `/admin#seasons`: ensure-current button, dodawanie/usuwanie nagród per tier, podgląd poprzednich sezonów. Claim w `$transaction` z token reward + notification. Premium track w schemie (gotowy na przyszłą integrację shop-pass).
- **Stream-event achievements + auto-grant engine** — system odznak rozszerzony o ~25 nowych achievementów wyzwalanych przez zdarzenia streamowe (donacje count + cumulative PLN, twitch/kick subs received, gift subs given, bits cheered, super chats, yt members, drops claimed, events won, shop purchases, platforms linked). Nowy `lib/achievements.ts` z `checkAndGrantAchievements(userId, triggerType)` — fire-and-forget helper, queryuje DB count, grantuje wszystkie unearned achievementy które przekroczyły próg w jednym `$transaction` (UserAchievement + token reward + notification), legendary/epic dodatkowo dispatchują stream alert na overlay. Wpięte w 8 handlerów: Twitch EventSub (sub/gift/cheer), Kick webhook (sub/gift), Streamlabs poll (donation), YouTube poll (super chat + member), drops/claim, events/draw (per winner), shop/buy, auth.ts signIn (po connection upsert). Wymaga `npm run db:seed` żeby załadować nowe achievementy.
- **Kick webhook integration** (zamyka Phase 2 I — Kick auto-events). Lustro Twitch EventSub dla Kicka. Streamer raz autoryzuje przez `/admin#kick → Autoryzuj Kick` (PKCE flow, scope `channel:read events:subscribe`), klika "Utwórz subskrypcje" → backend tworzy webhook subscriptions dla 5 typów: `channel.subscription.new`, `channel.subscription.renewal`, `channel.subscription.gifts`, `channel.followed`, `livestream.status.updated`. Receiver `/api/webhooks/kick-events` weryfikuje RSA-SHA256 podpis (publiczny klucz Kicka cached 24h), replay protection (10min window), idempotency po messageId. Handlers grantują GT przez Connection.kick match: sub=+5000, gift sub=+5000 per sub, follow=+500 (one-time per user). Każdy event triggeruje stream alert (visual reuse z Twitch) + bumpuje matching stream goals.
- **Predictions / Zakłady GT** — streamer w `/admin#predictions` tworzy zakład z 2-4 opcjami i opcjonalnym czasem zamknięcia. Widzowie na `/predictions` obstawiają tokeny (min 10, max 1M, jeden wager per user per prediction). Po rozstrzygnięciu wygrywająca opcja dzieli **całą pulę** (ze stawkami przegranych) proporcjonalnie do swoich stawek — winnerski payout = (twoja stawka / suma stawek wygranych) × totalPot. Edge case: brak zwycięskich obstawień → pełen refund wszystkim. Cancel anytime → refund wszystkim. Wszystko atomowo w `prisma.$transaction`, audit log + notification per uczestnik (wygrana / przegrana / refund). Nowy model `Prediction` + `PredictionEntry` (unique constraint na predictionId+userId).
- **Stream Goals + Hype Train tracker** (Phase 3B partial). Nowy model `StreamGoal` (type/target/current/label/resetMode/color) + `HypeTrainState` (singleton). Admin sekcja `/admin#goals` z formularzem CRUD: 6 typów celów (subs / gift_subs / follows / donations_pln / cheers_bits / yt_members), 5 trybów resetu (manual/per-stream/daily/weekly/monthly), color picker, progress bars, ręczny ±1, reset, toggle aktywności. Auto-inkrementacja z istniejących handlerów: Twitch EventSub (sub→+1, gift→+total, cheer→+bits) + Streamlabs donacje (PLN, fallback USD×4 dla innych walut) + YouTube super chats + members. Hype Train wpięty do Twitch EventSub (`channel.hype_train.begin/progress/end`) — wymaga dodatkowego scope `channel:read:hype_train` przy "Autoryzuj jako streamer". Overlay OBS na `/overlay/goals?token=<OVERLAY_TOKEN>` z animowanymi paskami postępu (bottom-left) + górnym hype train bannerem gdy aktywny.
- **YouTube Live Chat super chats + members** (zamyka Phase 2 J). Nowy model `YouTubeStreamerToken` (singleton) + `YouTubeEvent` (idempotency po messageId). Streamer raz autoryzuje przez `/admin#youtube → Autoryzuj YouTube` (osobny flow od loginu, scope `youtube.readonly`). Endpoint `/api/yt/poll-live-chat` (auth: admin session ALBO Bearer BOT_SECRET dla external cron) wykrywa aktywny live broadcast, pobiera nowe wiadomości incrementally (z `pageToken`), processsuje super chats (grant tokens donatorowi po YouTube Connection.platformId match, currency → PLN conversion z fallback USD×4), member events (newSponsor + memberMilestone), dispatchuje stream alerty. Token refresh auto przy expiry. Vercel Hobby nie obsłuży auto-pollingu — UI w adminie pokazuje setup dla cron-job.org.
- **Admin merge tool dla duplikatów** — sekcja "Merge duplikatów" w `/admin#merge`. Wykrywa potencjalne duplikaty po trzech sygnałach: wspólny OAuth account ID (najsilniejszy), wspólny email, wspólny Discord ID. Dla każdej grupy pokazuje statystyki side-by-side (tokeny, level, transakcje, achievementy, donejty, daty), klik na karcie wybiera primary/secondary, preview pokazuje co się przeniesie + konflikty (Account/Connection/Achievement/SocialLink/EventEntry/DropClaim primary'a wygrywają), confirm-by-typing-username przed wykonaniem. Całość w jednym `prisma.$transaction` — atomowe ale nieodwracalne. Blokuje merge konta admina/moda (najpierw odbierz role w sekcji Użytkownicy). Audit log loguje pełen breakdown.

### Changed

- **`images.domains` → `images.remotePatterns`** — `next.config.ts` migrował z deprecated `images.domains` (do usunięcia w przyszłym Next major) na `remotePatterns` z wymuszonym `protocol: "https"` (nigdy nie proxujemy plaintext-http obrazków). Dodany `files.kick.com` dla avatarów Kicka.
- **OVERLAY_TOKEN przeniesiony z env do DB** — token overlay'a żył w Vercel env vars co zmuszało admina do ręcznej generacji + redeploya przy każdej rotacji. Teraz token siedzi w `StreamAlertSettings.overlayToken`, auto-generuje się przy pierwszym wejściu na `/admin#alerts`, jest tam widoczny z przyciskami "Pokaż / Kopiuj token / Kopiuj URL OBS / Wygeneruj nowy". Env var pozostaje jako legacy fallback. Wymaga `npm run db:push`.

### Fixed

- **Kick streamer auth "wraca i nic się nie dzieje"** — callback czytał `user.name` z Kick `/users`, ale Kick zwraca `username` (i id jako `user_id` LUB `id`). `name` było `undefined`, a `KickStreamerToken.broadcasterLogin` jest wymagane → `prisma.upsert` rzucał błąd → callback 500 po powrocie z OAuth. `getOwnUser` normalizuje teraz oba pola (`username`/`name`/`slug` + `user_id`/`id`), upsert ma fallback `kick_<id>` + try/catch z czytelnym `kick_error=db_save`. Dodatkowo AdminClient pokazuje teraz toast z wynikiem autoryzacji (kick/twitch/yt success/error z query-paramów) — wcześniej nie było żadnego feedbacku.

### Security

- **Rate-limiting na pozostałych endpointach ekonomii** — `tasks/claim` (20/min), `events/join` (10/min) i `events/raffle-tickets` (10/min) dotykają Ghost Tokens (odbiór nagrody za zadanie, zapis do eventu, kupno biletów loterii), a jako jedyne z ekonomii nie miały limitu — dało się je spamować w pętli. Doszły do reszty (shop/buy, prediction/wager, drops/claim itd.) z tym samym DB-backed sliding-window limiterem (`lib/rate-limit.ts`, fail-open przy błędzie bazy): przekroczenie zwraca `429` z nagłówkami `X-RateLimit-*` + `Retry-After`. Klucz liczony per-user.
- **Twardsze nagłówki bezpieczeństwa** — CSP w `next.config.ts` dostało `object-src 'none'` (blok pluginów typu Flash/`<embed>`/`<object>`, których nie używamy) + `upgrade-insecure-requests` (każdy ewentualny http subresource wymuszony na https). Doszły też dwa nowe nagłówki: `Cross-Origin-Opener-Policy: same-origin-allow-popups` (izolacja naszego okna od cross-origin openerów → ochrona przed tabnabbing/XS-Leaks; `allow-popups` zostawia działające okna OAuth) oraz `X-Permitted-Cross-Domain-Policies: none`. Świadomie BEZ ruszania `script-src` — `unsafe-inline`/`unsafe-eval` zostają, bo ich usunięcie wymaga nonce'ów Next.js i niesie ryzyko regresji nieweryfikowalne samym buildem.

### Code Quality

- **Koniec z `(user as any)` / `(profile as any)` w `lib/auth.ts`** — wszystkie 13 rzutowań `as any` z warstwy auth poszło. Pola sesji (`isAdmin`/`tokens`/`level`/`username` itd.) czytane są teraz wprost z `user`: typ `AdapterUser` dziedziczy augmentację `next-auth` `User` z `types/next-auth.d.ts`, więc rzut był zbędny. Profil OAuth (provider-specyficzne `login`/`username`/`id`/`sub`) zawężony JEDEN raz nowym typem `OAuthProfileFields` zamiast `any` per-dostęp. W całym `src` nie ma już ani jednego `as any`. `tsconfig` ma `strict: true`, `tsc --noEmit` czysty.
- **ESLint w końcu działa** — w projekcie były zainstalowane `eslint` + `eslint-config-next`, ale BRAKOWAŁO pliku konfiguracyjnego, więc `next lint` prosił o interaktywny setup, a `next build` po cichu pomijał linting (zero realnej walidacji). Dodany `.eslintrc.json` (`next/core-web-vitals`) → lint chodzi w `npm run lint` i jest częścią `next build`. Dwie hałaśliwe reguły wyłączone świadomie: `react/no-unescaped-entities` (polskie apostrofy/cudzysłowy w JSX renderują się identycznie — 19 fałszywych alarmów) oraz `@next/next/no-img-element` (świadomy wybór architektoniczny: natywne lazy-avatary zamiast `next/image` przez limit optymalizatora obrazów na Vercel Hobby). Naprawione realne błędy: martwe dyrektywy `eslint-disable @typescript-eslint/...` w `auth.ts` (reguła nie ładowana w tym presecie → "rule not found") zamienione na zwykłe komentarze, a `<a href="/api/auth/streamlabs">` (route API robiący server-side redirect OAuth, nie strona Next) dostał celowy line-disable. Build przechodzi z włączonym lintem — zostaje jeden nie-krytyczny warning o foncie Anton.

### Performance

- **Strona główna — koniec z pętlą upsertów na każdym wejściu** — dla zalogowanego usera home robiło: 4 zapytania równolegle, potem SEKWENCYJNIE `dailyTask.findMany`, potem **N upsertów w pętli** (`for` z `await` w środku) dla codziennych zadań, potem bezwarunkowy refetch — do ~9 zapytań, kilka sekwencyjnych, na NAJCZĘŚCIEJ odwiedzanej stronie. Teraz: lista aktywnych zadań doszła do `Promise.all` (5 równolegle), brakujące `UserTask` tworzone jednym `createMany({ skipDuplicates })`, a refetch leci TYLKO gdy faktycznie coś utworzono. Typowy przypadek (zadania już istnieją) = 5 równoległych zapytań i zero dodatkowych round-tripów.
- **/shop — 2 zapytania zrównoleglone** — lista itemów i kontekst usera (tokeny/sub-tier) były pobierane sekwencyjnie (`await items` → `await user`). Teraz w jednym `Promise.all`; przy `connection_limit` w pgbouncer to realna oszczędność jednego round-tripa.
- **Avatary: natywny lazy-load + wymiary** — 6 surowych `<img>` (ranking ×2, home ×2, admin lista userów, eventy) dostało `loading="lazy"` + `decoding="async"` + `width/height` (rezerwacja miejsca → brak CLS) + `referrerPolicy="no-referrer"` (prywatność, brak wycieku URL do CDN Twitch/Discord). Świadomie BEZ `next/image` — to malutkie avatary z szybkich CDN, a optymalizator obrazów Vercela ma limit na planie Hobby; natywny lazy odracza ładowanie poza ekranem (długie listy rankingu) bez zżerania quoty.
- **/admin lazy-load sekcji — 18 → 7 zapytań na wejście** — panel admina pobierał server-side dane WSZYSTKICH 18 sekcji przy każdym otwarciu, mimo że widać jedną. Teraz tylko Dashboard (stats + drops/events/orders preview) renderuje się server-side; pozostałe sekcje (shop, event-manager, schedule, bot, audit, streamlabs, twitch, alerts) pobierają swoje dane dopiero gdy je otworzysz, przez nowy endpoint `/api/admin/section-data?s=X` + wrapper `<LazySection>`. Manager-komponenty bez zmian (tylko owinięte) — niskie ryzyko regresji. Pierwsze wejście na /admin znacząco szybsze.
- **Router Cache `staleTimes` — fix dla "na odwrót długo się ładuje"** — `force-dynamic` strony w Next 15 mają client-router-cache 0s, więc wracając na stronę którą przed chwilą widziałeś (admin ↔ profil ↔ achievements) przeglądarka pobierała ją od zera. `next.config.ts` → `experimental.staleTimes { dynamic: 30, static: 180 }` → back-nav w oknie 30s jest natychmiastowy (reuse RSC payload). Plus `optimizePackageImports: ["lucide-react"]` ścina JS na ikono-ciężkich stronach admin/profil.
- **Cache listy achievementów** — `/achievements` pobierał master-listę (47 odznak) + earned-counts + total users przy każdym wejściu. Teraz z cache (120s, `getCachedAchievementsMeta`); tylko dane usera (myEarned) live. Mniej zapytań przy każdej nawigacji na tę stronę.
- **DB indexes na hot queries** — `User` zyskał indeksy na `tokens`, `totalEarned`, `[level, xp]`, `streak` (sortowane przez ranking + homepage top-users) oraz `Connection` na `[platform, username]` (lookup w webhook handlerach przy każdym subie/cheerze). Zamienia full-table scan+sort na index range scan — kluczowe na free-tier Postgres. Wymaga `npm run db:push`.
- **Cache publicznych zapytań** (`lib/cached.ts`, `unstable_cache`) — ranking (45s per sort metric) i homepage top-users (60s) serwowane z cache zamiast uderzać w bazę przy każdym wejściu. Ranking to najcięższe publiczne zapytanie i wynik jest identyczny dla wszystkich → 1 hit DB na okno zamiast N. Cache'owane tylko selecty bez pól `Date` (uniknięcie JSON-serialization footgun).
- **Env tuning (do zastosowania w Vercel)** — `.env.example` podbity `connection_limit=1 → 3` + `pool_timeout=20`. To główny fix na "wolno / czasem w ogóle": limit=1 serializował wszystkie zapytania na 1 połączeniu i zatykał pulę pod obciążeniem. **User musi zmienić DATABASE_URL w Vercel env** (kod tego nie wymusi).
- **Parallelized admin page queries** — w `/admin` było ~10 sekwencyjnych `await prisma.*` po pierwszym Promise.all. Z `connection_limit=1` w DATABASE_URL (Supabase pgbouncer) każde query musiało czekać na poprzednie. Zlepione w jeden Promise.all → wszystko leci równolegle, czas ładowania `/admin` powinien spaść kilkukrotnie.
- **Dedup font loading** — `layout.tsx` ładowało Inter dwukrotnie (raz przez `next/font/google`, raz przez `<link>` do fonts.googleapis.com). Przeniesiony JetBrains Mono też do `next/font`, w `<head>` zostało tylko Anton (display font, brak w next/font Google Fonts subset) z `<link rel="preconnect">`. Mniej round-tripów, brak CLS na fontach.

### Added

- **Account linking from profile** — sekcja "Połączone platformy" w `/profile` pozwala zalogowanemu userowi dolinkować Twitch/Kick/Discord/Google do tego samego konta zamiast tworzyć duplikat. Bezpieczny flow: HMAC-signed `link_intent` cookie (5 min TTL) + przeniesienie Account row w signIn callback + cleanup orphan usera (jeśli brak danych ekonomicznych poza welcome bonusem). Endpoint odłączenia ma safety check — nie da się usunąć ostatniej metody logowania. ([2faeedd](#))
- **Social tiles na profilu** — kompaktowe tile'e z ikoną + handle (bez URLi). Twitch i Kick są pobierane automatycznie z OAuth Connection (badge "OAuth"); reszta (Instagram, X, TikTok, YouTube, Website) dodawana ręcznie z trybu edycji. Discord pominięty (brak publicznych profili). Cały tile = link, brand-color glow on hover. ([db66e58](#))
- **Sidebar nawigacja w `/admin`** — 11 sekcji (Dashboard, Użytkownicy, Eventy, Sklep, Drops, Harmonogram, Bot Discord, Donacje, Twitch, Stream Alerts, Audit log) zamiast jednej długiej listy. Sticky pionowy sidebar na desktop, poziomy scroll na mobile. URL hash deep-link (`/admin#shop`). Dashboard ma kafelki-skróty dla pending orders, aktywnych eventów, dropów. Sekcje filtrowane wg uprawnień moderatora. ([d89b553](#))
- **Stream Alerts (OBS overlay)** — `/overlay?token=<OVERLAY_TOKEN>` jako Browser Source dla OBS. Polling co 1.2 s, animowane slide-in alertów, syntezowany audio chime. Dispatch z 7 miejsc: shop buy, event win, drop bonus claim, Twitch sub/gift/cheer, Streamlabs donacja (matched+unmatched), welcome bonus. Admin section z testem, per-type togglami, kolorem akcentu, czasem wyświetlania. ([af7cf4a](#))

### Database

- Dodane modele `StreamAlert` (kolejka) + `StreamAlertSettings` (singleton). Wymaga `npm run db:push` po pull.
- Nowy env var `OVERLAY_TOKEN` (32-byte hex) dla bezpieczeństwa overlay URL.

---

## 2026-05-26 — Twitch EventSub + Streamlabs

### Added

- **Twitch EventSub auto-tracking** dla subów / gifted subów / bits — webhook handler z HMAC verification, replay protection (10 min window), idempotency po `message_id`. Per-tier reward (T1=5000, T2=10000, T3=25000, Prime=3000 GT), gifted subs z multipliterm tieru, bits ×10 GT. Streamer autoryzuje raz przez `/api/admin/twitch-streamer-auth`. ([4b2323a](#))
- **Streamlabs donation integration** zastępuje wcześniejszy PayMedia. OAuth flow, polling co 6h przez Vercel Cron (Hobby plan), auto-match po username lub @mention w wiadomości. 1 PLN = 100 GT konfigurowalne przez `DONATION_GT_PER_PLN`. ([c858b86](#))

### Fixed

- Streamlabs API v2.0 endpoints (v1.0 zwraca `invalid_client`). ([996c31b](#))
- Vercel cron musi być daily na Hobby plan (wcześniej hourly powodował błąd). ([a45b01d](#))

---

## 2026-05-25 — OAuth providers + ekonomia ×4 platform

### Added

- **Kick + Google OAuth** dodane jako logowanie. Kick to custom provider (brak gotowca w next-auth), Google = standardowy. ([2e4aabb](#))
- **Sticky footer** z linkami legalnymi i socialami streamera.
- **Bot config dashboard** — admin zmienia reward/cooldown bez deployu.
- **Stream schedule** — harmonogram streamów wyświetlany publicznie + zarządzanie w adminie.
- **OG images** dla social share previews (`/u/[username]`, ranking, profile). Generowane przez Satori. ([6c06c17](#))
- **Public profiles** `/u/[username]` — viewowanie cudzych profili bez logowania.
- **404 page** + privacy + terms.
- **Admin mod permissions** — granular permissions dla moderatorów (create_events, grant_tokens, ban_users, manage_shop itp). ([47ae55b](#), [4ffcf3b](#))
- **Site-level ban** — niezależne od bana na platformie, banuje w portalu. UI w adminie. ([4ffcf3b](#))
- **Admin quick-actions modal** na ranking (klik na usera → grant tokens / ban / make mod). ([bb5a68f](#))

### Fixed

- Twitch scope musi zawierać `openid` żeby odbierać `id_token`. ([7b9c57a](#))
- `allowDangerousEmailAccountLinking: true` na wszystkich 4 OAuth providerach (Twitch/Discord/Google/Kick) — pozwala automatycznie linkować po emailu jeśli match. ([2ee94ad](#))
- Kick token exchange wymaga `client_secret` w body, nie Basic auth. ([296656e](#))
- SocialLinks wymaga `"use client"` (event handlers). ([0c08819](#))
- OG images: `display: flex` explicit na text leaves (Satori strict mode). ([915a19b](#))
- OG images: rank emoji tile zamiast external img (Satori CDN issues). ([5b694fc](#))
- OG images: `await params` (Next 15 async params). ([b838508](#))

---

## Setup wymagany po pull

Po każdym pull, zweryfikuj:

1. **Migrations**: `cd ghost-empire-web && npm run db:push` (jeśli były zmiany schemy — sprawdzaj sekcję "Database" powyżej)
2. **Env vars**: `.env.example` jest źródłem prawdy — porównaj z `.env.local`
3. **Vercel env**: każdy nowy env var w `.env.example` musi być dodany do Vercel project settings
4. **Restart dev server**: po dużych refactorach HMR czasem nie odświeży — `Ctrl+C` i `npm run dev` na nowo
