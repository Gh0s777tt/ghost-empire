# AUDIT_REPORT.md — E-Forge / Ghost Empire

**Tryb:** read-only (bez zmian w kodzie, bez mutacji produkcji). **Data:** 2026-07-02. **Audytor:** senior engineer (Claude).
**Zakres:** `ghost-empire-phase1/` (głównie `ghost-empire-web/`), stan na commit `44adb6d` (#775), `main` = `origin/main` = zdalny `main`.
**Metoda:** analiza statyczna (2 równoległe przebiegi agentowe: jakość kodu · parytet UI↔kod) + własne deterministyczne sprawdzenia (git, `npm audit`/`npm outdated`, skan sekretów w HEAD i historii, testy+coverage, RLS/schemat na żywej bazie przez pg — tylko SELECT, sondy produkcji HTTP, przegląd tras w dev-serwerze). Wartości sekretów nie są ujawniane — tylko nazwy zmiennych.
**Poprzedni audyt:** 2026-06-28 (#730→#731 remediacja) — ten raport go zastępuje; stan tamtych ustaleń odnotowany w §8.

> **✅ Status remediacji (2026-07-02, po „zrób wszystko i napraw"):** wszystkie ustalenia w KODZIE domknięte w **#776–#779** — kontrakt błędów API `{error}`/`{reason}` + koniec cichych `try/finally` (§3/§6), crypto-RNG we wszystkich grach kasyna (§3), parytet UI↔kod: `/deck`+`/overlay/obs-control` dostają wejścia, nota ObsRules i status Hue przestają mylić, `/predictions` w NAV, martwy link rankingu (§3/§4), higiena: `clientIp()`/`clampInt()` do lib + `ENDPOINTS.md` uzupełnione + drobiazgi (§3). **733 testy zielone, 0 db push, 0 mutacji prod.** Zostają wyłącznie **owner-actions** (poza kodem): 🔴 rotacja klucza Resend i przegląd `origin/imgbot`; oraz świadomie **odroczone** większe prace (testy integracyjne money-path, podział `kasyno/shared.tsx` + wyniesienie changelogu z `about/page.tsx`, sweep hardcode `pl-PL`, rozszerzenie `check-docs-sync`) — patrz §7.8–7.9.

---

## 1. Podsumowanie

Projekt jest **dojrzały i bliski produkcyjnego — w praktyce już produkcyjny** (działa na `www.empire-forge.com`). Fundament jest solidny: 104/104 tabel z RLS (0 danych bez ochrony), 77/77 tras admina bramkowanych, wszystkie crony/webhooki/internal z guardami, 0 sekretów w kodzie i historii, 0 podatności `npm audit`, 726/726 testów zielonych, komplet dokumentacji z wymuszaną bramką `docs:check`. Nie znaleziono w KODZIE żadnego wpisu Krytycznego ani buga klasy „funkcja realnie zepsuta" (Wysoki) — wszystkie 40 tras widza + panel renderują się bez błędu.
**Trzy najważniejsze ryzyka:** (1) **proces, nie kod** — do wiadomości zlecającej audyt wkleił się klucz API Resend → do natychmiastowej rotacji; (2) **dwie działające, ale „ukryte" funkcje** (`/deck`, `/overlay/obs-control` bez wejścia w UI) + **atrapa Philips Hue** (formularz credów bez konsumenta) — to rozjazd „obietnica UI vs kod"; (3) **kontrakt błędów API** — kilka tras zwraca `{ok,reason}` zamiast `{error}`, przez co reprodukowalne stany (rate-limit, za mało GT) pokazują generyczny komunikat. Poza tym: dług to głównie duplikacja (IP-extraction, twin cards) i pokrycie testami warstwy integracyjnej (~44%). **Werdykt: produkcyjny; do domknięcia głównie higiena UX/docs + rotacja klucza.**

## 2. Zacznij tutaj (gdyby naprawić tylko 3 rzeczy)

1. **Zrotuj klucz Resend** (wpis Krytyczny w §3, usprawnienie §7.1) — jedyne realne ryzyko bezpieczeństwa; klucz wyciekł do transkryptu, nowy ustaw wyłącznie w Vercel env.
2. **Ujednolić kontrakt błędów API `{error}`** na trasach z §3/§6 (`gift`, `collectibles/open-pack`, `admin/push`) — usuwa 2 reprodukowalne bugi UX jednym ruchem (§7.2).
3. **Podpiąć/oznaczyć „ukryte" funkcje** — link do `/deck`, wpis `/overlay/obs-control` w Widgets, poprawić notę ObsRules i kartę Hue (§7.4–7.5); to zamyka wszystkie 4 rozjazdy „UI vs kod" z macierzy.

## 3. Tabela ustaleń

| Severity | Obszar | Problem | Dowód | Rekomendacja |
|---|---|---|---|---|
| **Krytyczny** | Sekrety / proces | W wiadomości zlecającej audyt (transkrypt czatu) wklejony został ciąg o formacie klucza API Resend (`re_…`, wpleciony w środek słowa — wygląd przypadkowego wklejenia ze schowka). Transkrypt czatu nie jest bezpiecznym magazynem sekretów. | wiadomość właściciela z 2026-07-02 (sekcja „Czego NIE robić") | **Zrotuj klucz w panelu Resend natychmiast**; nowy klucz ustaw wyłącznie w Vercel env (`RESEND_API_KEY`). Klucz z czatu traktuj jako spalony. |
| Niski | Higiena repo | Osierocony branch zdalny `origin/imgbot` ([ImgBot] Optimize images, commit `b00ecaa`) — 31 commitów za `main`, niezmergowany, wisi bez PR-decyzji. | `git branch -a` → `remotes/origin/imgbot` | Przejrzyj diff ImgBota (kompresja obrazów w `public/`); zmerguj albo usuń branch. |
| **Średni** | Docs (drift) | `docs/ENDPOINTS.md` nie zawiera dwóch nowych, money-path tras widza: `/api/titles` (#761 — spend GT) i `/api/auctions` (#762 — escrow GT). CHANGELOG/ROADMAP je opisują, ale referencja endpointów drifnęła (bramka `docs:check` pilnuje tylko CHANGELOG, nie ENDPOINTS.md). | `grep "api/auctions\|api/titles" docs/ENDPOINTS.md` = 0; pliki `src/app/api/{auctions,titles}/route.ts` istnieją | Dopisz oba wiersze do `ENDPOINTS.md`; rozważ rozszerzenie `check-docs-sync` o skan nowych `route.ts` bez wpisu. |
| **Średni** | Testy (pokrycie) | Pokrycie **~44% statements** (1806/4112), 49% funkcji. Testowana jest czysta logika (money-path pure: economy/predictions/auctions/titles/gift/wheel — dobrze), ale trasy API i komponenty (integracja/UI) są w większości nieprzetestowane; konwencja repo: vitest = tylko pure, bez mocków DB/sieci. | `npm run test:coverage` (2026-07-02): 43.92% stmts, 726/726 pass | Utrzymać pure-first, ale dodać cienką warstwę testów integracyjnych na 3–5 najbardziej krytycznych trasach money-path (`vitest.integration.config.ts` już istnieje, ale bez testów). |
| Niski | Zależności | Drift patch/minor: `next` 16.2.9→16.2.10, `@sentry/nextjs`, `tailwindcss` 4.3.1→4.3.2, `lucide-react` i in.; `eslint` 9.39 przy dostępnym 10.x (major). `next-auth` przypięty do `5.0.0-beta.31` (celowe — v4 „Latest" to downgrade). | `npm outdated` (2026-07-02) | Rutynowy bump patchy przy okazji; eslint 10 jako osobny, świadomy upgrade. |
| Niski | Docs (drift) | `AUDIT_REPORT.md` (poprzedni) datowany 2026-06-28 na commit #730 — nieaktualny względem #775 (był mylący jako „bieżący" stan). | `head AUDIT_REPORT.md` (przed nadpisaniem) | Ten raport go zastępuje. |
| **Średni** | Integracja / dead-end | **Philips Hue = „guzik bez akcji": formularz zapisuje creds (`hueBridgeIp`+`hueApiKey`) i pokazuje status „configured", ale ŻADEN kod ich nie konsumuje** — brak `lib/hue`, brak aktuatora (grep 0 poza formularzem/storem). Wprowadza w błąd (użytkownik myśli, że światła zadziałają). Kod sam to przyznaje (komentarz „actuator… next slice #754"). | `src/components/admin/sections/Integrations.tsx:245-250`, `src/app/api/admin/integrations/route.ts:80` | Badge „wkrótce/tylko creds" przy karcie Hue albo dowieźć aktuator (browser-source jak OBS-control). |
| **Średni** | UI/docs drift | **Sekcja `ObsRules` bezwarunkowo renderuje notę „nic tego jeszcze nie wykonuje — kontroler w OBS przyjdzie w kolejnym kroku", mimo że aktuator OBS ISTNIEJE** (`/overlay/obs-control` — headless, steruje scenami/źródłami/filtrami, #672). Nota myli. | `src/components/admin/sections/ObsRules.tsx:141` + `messages/{en,pl}.json:2104` vs `src/app/overlay/obs-control/page.tsx:2-5` | Zmień notę na instrukcję dodania browser-source `/overlay/obs-control?token=…`. |
| **Średni** | Akcja bez guzika | **Dwie działające powierzchnie bez punktu wejścia w UI:** (a) `/overlay/obs-control` nie występuje w bibliotece Widgets (23 wpisy) ani w ObsRules/Integrations — admin musi znać URL z kodu; (b) `/deck` (#774) nie ma linku nigdzie (Header, paleta komend, admin) — jedyny ślad to wykluczenie z prefetch. | `src/components/admin/sections/Widgets.tsx:91-114` (brak obs-control), `src/lib/command-palette.ts:8-33` (brak deck), `src/components/Header.tsx` | Dodaj wpis „OBS controller" w Widgets + link „Deck" w menu konta dla admin/mod. |
| Niski | Nawigacja | `/predictions` nie ma linku w NAV, choć bliźniacze `/polls` i `/trivia` są w grupie „community" — dostęp tylko przez paletę/notyfikacje/link z `/leagues`. Wygląda na przeoczenie (nie świadomą architekturę jak `/quests`,`/seasons`). | `src/components/Header.tsx:46-63` (brak `/predictions`) | Dodaj `/predictions` do grupy community w NAV. |
| Niski | Martwy link | Wiersz rankingu dla usera bez `username` renderuje `<Link href="#">` → klik przewija do góry zamiast no-op. | `src/components/ranking/RankingClient.tsx:185` | Renderuj `<span>` gdy brak username. |
| **Średni** | Spójność / hardening (money-adjacent) | **Wszystkie gry kasyna GT (sloty, coinflip, dice, crash, plinko, ruletka, scratch, blackjack, hilo, mines) losują przez `Math.random`**, podczas gdy losowania NAGRÓD używają crypto („Crypto-secure Fisher-Yates"). Ścieżka ma realną wartość (GT kupuje nagrody). **Nie jest to żywy exploit** (klient nie widzi surowego ziarna/outputów — tylko wynik win/loss liczony serwerowo), więc to niespójność standardu/hardening, nie dziura. Parametr `rng` już istnieje, ale nie jest nadpisywany w wywołaniach prod. | `src/lib/gt-games.ts:66,74,108,135,153,190,217`, `lib/gt-blackjack.ts:63`, `lib/gt-mines.ts:33`, `lib/gt-hilo.ts:19` vs `app/api/admin/events/draw/route.ts:12-13` | Wstrzyknąć `rng` z `crypto.randomInt` w wywołaniach serwerowych — parametr gotowy, koszt minimalny. |
| **Średni** | UX / kontrakt API | **Kilka tras zwraca `{ok:false, reason}` z kodem 4xx zamiast udokumentowanego kształtu `{error}`** — `apiPost` rzuca wtedy `ApiError("HTTP 429")`, a UI pokazuje generyczny komunikat zamiast konkretnego (rate-limited/unauthorized ginie). Reprodukowalny bug UX. | `lib/api-client.ts:3-5,23-27` vs `app/api/gift/route.ts:18,23,26`, `app/api/collectibles/open-pack/route.ts:16,21,52`, `app/api/admin/push/route.ts:26`; zjadające catch: `GiftButton.tsx:36-37`, `CollectiblesClient.tsx:50-51` | Przy 4xx zwracać też klucz `error` (lub nauczyć `api-client` czytać `reason`). |
| **Średni** | Odporność na błędy | **28 surowych `fetch("/api/…")` w 20 komponentach** (mimo `api-client`); wzorzec `try/finally` **bez `catch`** → awaria sieci lub nie-JSON body (np. 502 z proxy → `res.json()` rzuca) = nieobsłużone odrzucenie i **cichy brak toasta**. | `components/admin/sections/Shop.tsx:34-50`, `Events.tsx:281,448`, `home/HomeClient.tsx:504` (+17 plików) | Zmigrować zwykłe wywołania JSON na `apiGet`/`apiPost` (wyjątki: beacon/keepalive, push, passkey). |
| Niski | Duplikacja | Ekstrakcja IP klienta `x-forwarded-for…split(",")[0]…\|\|"unknown"` skopiowana w ~12 trasach + osobny parser w audit → zmiana logiki = 13 miejsc. | `api/gift/route.ts:21`, `api/market/route.ts:60`, `api/search/users/route.ts:13`, `lib/audit.ts:86` (+9) | Wydzielić `clientIp(req)` do `lib/http.ts`. |
| Niski | Duplikacja | Bliźniacze karty overlay `PollOverlayCard` (74 l.) i `PredictionOverlayCard` (75 l.) różnią się tylko nazwami propów/kolorem/etykietami; też duplikaty `clampCooldown`/`clampInterval` w trasach admin. | `components/{PollOverlayCard,PredictionOverlayCard}.tsx`; `api/admin/{faq,chat-commands,chat-timers}/route.ts` | Jeden parametryzowany komponent + `clampInt` w lib. |
| Niski | i18n / white-label | **`about/page.tsx` (1110 l., największy plik w src) trzyma ~800-liniową POLSKĄ tablicę CHANGELOG renderowaną identycznie dla 14 języków**; dodatkowo 10 plików (w tym overlaye OBS + webhooki) formatuje daty/liczby na sztywno `"pl-PL"` mimo white-label. | `app/[locale]/about/page.tsx:23,1065`; overlaye clan/clan-war, `webhooks/twitch-eventsub`, `bot/gt-game`, `yt/poll-live-chat` | Wynieść changelog do danych + oznaczyć PL-only; locale z tenanta zamiast stałej. |
| Niski | Jakość | `key={index}` na filtrowanej liście `EmojiPicker` (remount przy każdym znaku); 1 goły `eslint-disable react-hooks` bez uzasadnienia (konwencja repo #733 wymaga nr PR); `kasyno/shared.tsx` (1043 l.) = worek 7 gier — NOWY kandydat do podziału (poza decyzjami #733/#736). | `EmojiPicker.tsx:70,77`; `admin/sections/DatabaseReset.tsx:34`; `components/kasyno/shared.tsx` | `key={e.char}`; dopisać uzasadnienie; rozbić shared na `constants.ts` + moduły per gra. |

### Pozytywy (zweryfikowane, nie „pochwały" — dowody)
- **Bezpieczeństwo tras admina:** **77/77 plików `api/admin/*/route.ts` bramkowane** helperami `lib/admin` (`requirePermission`/`requireAdmin`/`requirePlatformOwner`/`requireStepUp`) — 0 ręcznych/pominiętych (61 grepem + 16 ręcznie).
- **Crony/webhooki/internal:** 0 bez guarda (`CRON_SECRET` / weryfikacja podpisu / `BOT_SECRET`).
- **Higiena kodu:** **0** `TODO/FIXME/HACK` w kodzie, **0** `@ts-ignore`/`@ts-expect-error`, **6** realnych `any` (żaden w money-path/billing/webhookach płatności), **2** `console.log` (oba za `NODE_ENV!=="production"`), **0** plików-sierot, **0** zakomentowanych bloków >5 l.
- **Parytet panelu:** 52 sekcje w rejestrze = 52 bloki renderu = 61 plików (60 przez lazy-sections + 1 statycznie) — **0 sierot w obie strony**.
- **RLS:** 104/104, **0** tabel z danymi bez RLS.

## 4. Macierz rozbieżności dashboard ↔ kod

Legenda: „dormant" = zbudowane, uśpione do czasu wklejenia klucza/creds (NIE bug — świadoma architektura). Pełny przebieg pokrył ~45 funkcji; poniżej reprezentatywny wycinek + wszystkie rozbieżności.

| Funkcja | W UI? | W kodzie? | Aktualna? | Uwagi (dowód) |
|---|---|---|---|---|
| Sklep GT + realizacja zamówień | tak | tak | tak | /shop, api/shop/buy, admin Shop+PendingOrders |
| Gift GT, Tytuły, Referral, Watch-streak | tak | tak | tak | profile/* → api/{gift,titles,referral,watch-streak} |
| Aukcje GT (#762) | tak | tak | tak | admin zarządza **inline na stronie** (celowo brak sekcji panelu) |
| Kasyno GT (10 gier) | tak | tak | tak | KasynoClient; RNG=`Math.random` (§3 Średni) |
| Koło / Trivia / Ankiety / Companion | tak | tak | tak | strona+overlay+admin+api |
| Eventy / Predykcje / Bounties / Ligi | tak | tak | tak | Predykcje bez linku NAV (§3 Niski) |
| Klany + wojny klanów | tak | tak | tak | overlaye clan+clan-war |
| Kolekcje + market kart | tak | tak | tak | open-pack + giełda |
| Wrapped, Profil publiczny /u | tak | tak | tak | + opengraph-image |
| Premium / Stripe | tak | tak | **tak (LIVE)** | webhook aktywuje plan |
| Panel admina (52 sekcje) | tak | tak | tak | pełna parzystość rejestr↔render↔pliki |
| **Deck streamera (#774)** | **nie** | tak | tak | strona+client działają, **ZERO linków w UI** (§3 Średni) |
| **Philips Hue** | tak (formularz) | **nie (brak aktuatora)** | dormant/atrapa | creds zapisywane, nic ich nie czyta (§3 Średni) |
| **OBS control (aktuator)** | częściowo | tak | dormant | `/overlay/obs-control` istnieje, ale UI mówi „wkrótce" + brak w Widgets (§3 ×2 Średni) |
| Govee lighting | tak | tak | dormant | pełny aktuator `lib/alerts.ts:93`; klucz+urządzenie |
| Streamlabs / PayMedia | częściowo | tak | dormant | wymaga OAuth/secret |
| AI (bot @, !imagine, assistant, chat-translate, search) | tak | tak | dormant | klucz AI w Integracje |
| X / Meta social | tak | tak | dormant | bez tokenu renderuje null |
| Push / E-mail digest / Backup S3 / Sentry | częściowo | tak | dormant | VAPID/RESEND/BACKUP_S3/SENTRY_DSN |
| Presence „online teraz" (#767) | tak | tak | **tak (prod ma Redis)** | bez Redis znika |
| Bot: komendy/timery/faq/welcome/duel/heist | tak (admin) | tak | tak | 12 tras api/bot dla osobnego runtime bota |

**Wniosek macierzy:** brak klasycznych atrap („guzik bez akcji"/„akcja bez guzika") POZA trzema udokumentowanymi w §3 (Hue, deck-bez-linku, obs-control-bez-wejścia). 16 funkcji „dormant by design" — z czego **tylko Hue** nie ma jeszcze kodu wykonawczego (reszta ma pełny aktuator, czeka wyłącznie na klucz).

## 5. Stan usług

### Supabase (Postgres) — **czysto**
- **Schemat ↔ kod:** 104 modele Prisma = **104 tabele** w `public`. Brakujących: 0. Nadmiarowych: 0. (`prisma migrate diff` z poprzedniej sesji: „empty migration" — zero driftu kolumn/indeksów.)
- **RLS:** **104/104 tabel ma RLS ON.** Wszystkie 104 mają „RLS ON, zero policies" — to **zamierzony i poprawny** posture: rola aplikacji to `postgres` z **`rolbypassrls = true`** (zweryfikowane: `owned tables = 104`), więc aplikacja (Prisma) omija RLS, a publiczne anon-API Supabase (PostgREST) jest **deny-all** na każdej tabeli. Zero tabel z danymi bez RLS. *(Uwaga: luka na `auctions`/`auction_bids` z #762 została domknięta w #766 — potwierdzone teraz na żywo.)*
- **Klucze:** `service_role`/`DATABASE_URL` **nie występują** w komponentach klienta ani w bundlu (`git grep` w `src/components`/`*.tsx` = 0). `DATABASE_URL` czytany tylko server-side.

### Vercel
- Projekt zlinkowany (`.vercel/project.json` → `ghost-empire-web`). **Brak tokenu CLI** → lista env/deployów z konsoli niedostępna (luka audytu). Weryfikacja pośrednia (sondy produkcji `www.empire-forge.com`): core (`DATABASE_URL`/`NEXTAUTH_SECRET`/`BOT_SECRET`) działa, OAuth ×4 (`/api/auth/providers` = twitch,discord,google,kick), VAPID (`/api/push/vapid` zwraca klucz), Stripe (checkout 401 nie 503), `CRON_SECRET` (crony 401 bez bearera) — **ustawione**. `NEXT_PUBLIC_*` = tylko `ROOT_DOMAIN` + `SITE_URL` (nie-sekrety, poprawnie publiczne).
- **Crony:** wszystkie 9 tras `api/cron/*` mają guard `verifyCronSecret`/`CRON_SECRET` (skan: 0 bez guarda). vercel.json deklaruje 5 harmonogramów (streamlabs/prune/weekly-rewards/backup/weekly-digest).
- **Webhooki:** wszystkie `api/webhooks/*` weryfikują podpis (`constructEvent`/HMAC/`timingSafeEqual`) — 0 bez weryfikacji.

### Upstash Redis (cache/rate-limit/presence)
- Klucze **server-only:** `@/lib/redis` (i `@upstash/*`) **nie są importowane** z żadnego `"use client"` (skan: 0 trafień). Presence rozdzielono na `presence-shared.ts` (client-safe) vs `presence.ts` (server, redis+prisma) — poprawnie.
- **Dormant-safe:** bez `UPSTASH_*` cache spada na in-memory (cap 1000, FIFO), rate-limit i presence degradują się bez crasha. Na produkcji Redis **jest** (presence `/api/presence` = `{"active":true}`).
- **Rate-limiting:** obecny na money-path i mutacjach (potwierdzone w kodzie tras: gift/titles/auctions/presence/shop-buy…); pełną macierz pokrycia — patrz przebieg jakości kodu (§3).

### Resend (email, #773) — dormant
- `lib/email.ts` = Resend REST (fetch), aktywne tylko z `RESEND_API_KEY`+`EMAIL_FROM`. **Nieustawione** → cron `weekly-digest` zwraca `{skipped:true}` (dormant by design). **Uwaga bezpieczeństwa: patrz wpis Krytyczny w §3** (klucz Resend wklejony do czatu → do rotacji).

## 6. Bugi do odtworzenia

1. **Rate-limit na gift pokazuje generyczny błąd zamiast „za dużo prób".** Kroki: zaloguj się, na cudzym profilu publicznym kliknij prezent GT >20 razy w 60 s → 21. żądanie dostaje HTTP 429 z body `{ok:false, reason:"rate-limited"}`. Oczekiwane: toast „za dużo prób / odczekaj". Faktyczne: `apiPost` rzuca `ApiError("HTTP 429")` (bo nie ma klucza `error`), `GiftButton.tsx:36-37` łapie i pokazuje generyczny `errGeneric`. Dowód: `api/gift/route.ts:23` + `api-client.ts:23-27`. Severity: Średni.
2. **Otwieranie paczki przy braku GT / rate-limicie — jak wyżej.** Kroki: na `/collectibles` z saldem < ceny paczki kliknij „otwórz" → 402 `{ok:false, reason:"insufficient"}`; UI pokaże generyk zamiast „za mało GT". Dowód: `api/collectibles/open-pack/route.ts:16,21,52` + `CollectiblesClient.tsx:50-51`. Severity: Średni.
3. **Cichy brak reakcji przy błędzie sieci/proxy w panelu.** Kroki: w sekcji admina Shop wykonaj akcję, gdy backend zwróci 502 z proxy (nie-JSON body). `res.json()` w gałęzi błędu rzuca, `try/finally` bez `catch` → nieobsłużone odrzucenie, brak toasta (użytkownik nie wie, że akcja padła). Dowód: `components/admin/sections/Shop.tsx:34-50`. Severity: Średni.
4. **Klik w wiersz rankingu usera bez `username` przewija stronę do góry.** Kroki: na `/ranking` znajdź konto bez ustawionego username → klik wiersza. Faktyczne: nawigacja do `#` (scroll-to-top). Oczekiwane: brak akcji. Dowód: `RankingClient.tsx:185`. Severity: Niski.

**Uwaga:** nie znaleziono bugu klasy Wysoki (funkcja realnie zepsuta) ani Krytyczny w KODZIE. Wszystkie 40 tras widza + panel renderują się (HTTP 200, 0 runtime-error), overlaye z graceful-fallback (`/overlay/scene/nieistniejący` → 200 bez crasha), gate'y auth działają (`/api/notifications` → 401, `/deck` gość → grzeczna odmowa). Jedyny wpis Krytyczny dotyczy PROCESU (klucz Resend w czacie), nie kodu.

## 7. Top usprawnień (posortowane wg korzyść/koszt)

1. **[S] Zrotuj klucz Resend (proces) + ustaw go tylko w Vercel env.** Korzyść: zamknięcie jedynego wpisu Krytycznego. Koszt trywialny (panel Resend + 1 zmienna). Odblokowuje też #773 (digesty).
2. **[S] Ujednolić kontrakt błędów API `{error}` na ~5 trasach** (`gift`, `collectibles/open-pack`, `admin/push`, …). Korzyść: 2 reprodukowalne bugi UX znikają (rate-limit/402 pokazują konkretny komunikat). Koszt: dodać `error` obok `reason`.
3. **[S] `crypto.randomInt` jako `rng` w wywołaniach kasyna.** Korzyść: spójny standard losowości na ścieżce o realnej wartości; parametr już istnieje. Koszt: 2 wywołania serwerowe (`gt-games/play`, `bot/gt-game`).
4. **[S] Dodać wejścia w UI do `/deck` (link w menu konta admin/mod) i `/overlay/obs-control` (wpis w Widgets).** Korzyść: dwie działające funkcje przestają być „ukryte przed userem". Koszt: 1 link + 1 wiersz w rejestrze widgetów.
5. **[S] Zaktualizować notę „dormant" w `ObsRules` + kartę Hue.** Korzyść: koniec wprowadzania w błąd (OBS-aktuator istnieje; Hue nie ma konsumenta → badge „tylko creds"). Koszt: 2 stringi i18n + 1 badge.
6. **[S] Dopisać `/api/titles` i `/api/auctions` do `docs/ENDPOINTS.md`** + rozszerzyć `check-docs-sync` o skan nowych `route.ts`. Korzyść: bramka łapie przyszły drift endpointów (dziś pilnuje tylko CHANGELOG). Koszt: 2 wiersze + kilka linii skryptu.
7. **[M] Wydzielić `clientIp(req)` do `lib/http.ts` i zmigrować 28 surowych `fetch` na `apiGet/apiPost`.** Korzyść: koniec duplikacji IP (13 miejsc) + eliminacja cichych błędów `try/finally`-bez-`catch`. Koszt: mechaniczny sweep, testowalny.
8. **[M] Cienka warstwa testów integracyjnych na 3–5 trasach money-path** (`vitest.integration.config.ts` już istnieje, ale 0 testów). Korzyść: pokrycie skacze z „44% pure" na realną walidację atomowości spendów. Koszt: setup test-DB + 5 testów.
9. **[M] Rozbić `components/kasyno/shared.tsx` (1043 l.) na `constants.ts` + moduły per gra** oraz wynieść ~800-liniowy CHANGELOG z `about/page.tsx` do pliku danych. Korzyść: dwa największe realne worki treści-jako-kodu. Koszt: mechaniczny, bez zmiany zachowania.
10. **[S] Zamknąć `origin/imgbot` + bump patchy (`next`/`tailwind`/`sentry`).** Korzyść: higiena. Koszt: przegląd 1 diffa + `npm update` (świadomie).

*(Pominięto kosmetykę: nazewnictwo, `key={index}` w EmojiPicker, twin overlay cards — są w tabeli §3 jako Niski, ale nie w top-10.)*

## 8. Higiena repo

- **Working tree:** czysty (`git status` — 0 zmian). **HEAD = origin/main = zdalny main** (`44adb6d`, #775) — zero niewypchniętych commitów.
- **Branche:** lokalnie tylko `main`. Zdalnie: `origin/imgbot` — osierocony (patrz tabela ustaleń). 8 branchy dependabot z poprzedniego audytu **nie istnieje już na origin** (wyczyszczone).
- **Tagi:** brak (w tym brak tagu `backup` odnotowanego w audycie 2026-06-28 — wyczyszczony).
- **CHANGELOG:** aktualny — `npm run docs:check` ✅ „all 60 recent shipped PR(s) present, latest #775" (bramka wymuszana lokalnie i w CI; wpisy dla każdego PR od #716+).
- **Backlog:** `ROADMAP.md` (running log „Świeżo dowiezione" + sekcje faz) i `docs/IDEAS.md` (statusy ✅/🟡 aktualizowane przy dowiezieniu — zweryfikowane wpisy #767–#775). Odzwierciedlają rzeczywistość.
- **Sekrety w repo/historii:** **czysto.** Trackowane są wyłącznie `.env.example` (web + chat + tenants/example); realny `.env` nigdy nie był trackowany (`git log --all -- ghost-empire-web/.env` = pusto). Trafienia wzorców (`sk_live_`, `whsec_`) w `docs/ENV.md:87-88`, `scripts/check-stripe.ts:36-40`, `src/lib/billing.ts:9-10` to **prefiksy w dokumentacji/walidacji**, nie wartości.
- **Zależności:** `npm audit` (prod i dev): **0 podatności**. Outdated — patrz tabela ustaleń (Niski).

## 9. Luki w audycie

- **Vercel:** brak tokenu CLI → nie odczytałem 1:1 listy env, statusów deployów ani logów buildów z konsoli. Obecność kluczy zweryfikowana **pośrednio** przez zachowanie produkcji (sondy HTTP) + `docs/ENV.md` — to potwierdza „ustawione/nieustawione", ale nie wartości ani pełnej listy. Rekomendacja właściciela: `vercel env ls` / dashboard dla pełnej weryfikacji.
- **Weryfikacja wizualna = DOM/tekst, nie zrzuty.** `preview_screenshot` ma na tej aplikacji znany timeout (ciężkie animacje/polling) — sprawdzałem trasy przez status HTTP + `fetch`/DOM-eval (render bez runtime-error), nie przez obrazki. Wygląd pikselowy pojedynczych widoków nieoceniany.
- **Bugi money-path NIE odtwarzane mutująco.** Audyt read-only — nie wykonywałem realnych spendów/wypłat/mutacji na prod. Bugi z §6 opisane z dowodem w kodzie + ścieżką repro, ale nie „kliknięte" do końca (np. faktyczny 429 na gift), by nie mutować prod.
- **Bot `ghost-empire-chat`** (osobny runtime) audytowany tylko od strony kontraktu z portalem (trasy `api/bot`/`api/internal` + guardy) — nie uruchamiałem samego bota ani nie audytowałem jego wewnętrznego kodu.
- **RNG jako exploit:** ocena „nie żywy exploit" (§3 kasyno) oparta na analizie (klient nie widzi surowych outputów Math.random) — nie przeprowadzałem faktycznej próby rekonstrukcji stanu PRNG.

## 10. Metodyka

**Uruchomione komendy / narzędzia (wszystko read-only):**
- `git status/branch -a/tag/log` — stan repo, branche, tagi, historia (skan `-S` sekretów).
- `git grep -E "(sk_live_|whsec_|re_…|AKIA…|ghp_…|AIza…)"` w HEAD + `git log --all --diff-filter=A -- "*.env*"` — skan sekretów w kodzie i historii.
- `npm audit` (prod+dev) i `npm outdated` — podatności i drift zależności.
- `npm run test:coverage` (vitest v8) — 726/726, 43.92% stmts.
- **Żywa baza (tylko SELECT/ALTER-free):** własny skrypt pg (`db-audit.cjs`) — porównanie 104 modeli schematu z `pg_class`/`pg_tables`, `relrowsecurity` + `pg_policy` per tabela, `rolbypassrls` roli aplikacji. Filtr wyjścia usuwał connection-string.
- **Dev-serwer (port 3100 z `.claude/launch.json`) + preview-eval:** `fetch` na wszystkie 40 tras `[locale]` + panel + wybrane overlaye/API — status HTTP + wykrywanie runtime-error w HTML.
- **Produkcja (sondy HTTP `www.empire-forge.com`):** `/api/auth/providers`, `/api/push/vapid`, `/api/billing/checkout`, `/api/presence`, crony (401 bez bearera) — weryfikacja kluczy przez zachowanie.
- **Skany strukturalne:** guardy 77 tras admin, 9 cron, 4 webhook, 9 internal; import redis/DATABASE_URL w klientach; trasy vs `ENDPOINTS.md`; rejestr sekcji admina vs pliki.
- **2 równoległe agenty (read-only):** jakość kodu (`any`/TODO/console/duplikacja/długie pliki/spójność bramek) i parytet UI↔kod (inwentarz tras, macierz, guziki bez akcji).

**Czego realnie NIE zmieniałem:** zero commitów, zero pushy, zero mutacji prod (Vercel/Supabase/Upstash), zero migracji. Jedyny zapis: ten plik `AUDIT_REPORT.md`.

---
*Raport kompletny — wszystkie fazy 0–6 wykonane; każdy wpis tabeli ma severity + dowód. Zatrzymuję się (read-only) i czekam na decyzję, co naprawić.*

---

## Faza 0 — Rozpoznanie (DONE)

- **Stack:** Next.js **16.2.9** (App Router, Turbopack build) · React 19 · TypeScript · Prisma **7** (driver adapter pg) · Auth.js **v5 beta.31** (sesje DB) · Tailwind **4** · next-intl (14 locale, PL unprefixed) · Upstash Redis (REST) · Supabase Postgres (pooler 6543 / direct 5432) · Vercel (main auto-deploy). Node **>=22** (engines), menedżer: **npm** (package-lock.json).
- **Monorepo:** `ghost-empire-web/` (portal+API+admin+overlaye), `ghost-empire-chat/` (bot czatu Twitch/Kick/YT, osobny runtime), docs w rootcie (`CHANGELOG/ROADMAP/docs/*`). Discord = osobne repo E-Bot.
- **Uruchomienie:** `npm run dev` (dev, port z `.claude/launch.json` = 3100), `npm run build`, testy `npm test` (vitest), `npm run docs:check` (bramka dokumentacji).
- **Mapa:** routing `src/app/[locale]/*` (widz) + `src/app/overlay/*` (OBS) + `src/app/api/*` (REST); warstwa danych `src/lib/prisma.ts` + `prisma/schema.prisma` (104 modele); integracje `src/lib/*` (twitch/kick/yt/stripe/govee/ai/…); admin jako jedna strona `/admin` z rejestrem sekcji w `components/admin/AdminClient.tsx`; CSP per-request w `src/proxy.ts`.
