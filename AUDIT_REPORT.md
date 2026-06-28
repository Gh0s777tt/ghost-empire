# AUDIT_REPORT.md — Ghost Empire

**Tryb:** read-only (bez zmian w kodzie, bez mutacji produkcji). **Data:** 2026-06-28. **Audytor:** senior engineer (Claude).
**Zakres:** `ghost-empire-phase1/` (głównie `ghost-empire-web/`), stan na commit `6906324` (#730), `main` = `origin/main`.
**Metoda:** statyczna analiza kodu (5 równoległych przebiegów: jakość kodu · parytet dashboard↔kod · bezpieczeństwo/backend · dokumentacja · własne deterministyczne sprawdzenia), audyt RLS na żywej bazie przez pg-adapter (tylko odczyt), `git`, `npm audit`/`npm outdated`. Wartości sekretów nie są ujawniane — tylko nazwy zmiennych.

---

## 0. Status remediacji (#731 — 2026-06-28)

Po audycie wykonano remediację (commit **#731**, wszystkie bramki zielone, bez zmian schematu / db push):

**✅ Naprawione**
- Bug i18n `secDesc_goverules` → rename (`en`+`pl`; 12 lokalizacji dziedziczy z EN przez runtime `deepMerge`).
- **2FA step-up fail-closed** na `reset-database` (Wysoki) — globalny wipe nie pominie 2FA przy dryfcie klucza.
- **`bot/ai-reply` fail-closed** na rate-limicie (płatna ścieżka AI; parytet z `bot/imagine`).
- **Rate-limit dodany:** `daily-bonus`, `profile/social-links`, `notifications`, `push/subscribe`.
- **Asercja `ENCRYPTION_KEY`/`NEXTAUTH_SECRET`** w produkcji (fail-fast zamiast publicznego dev-klucza).
- `KickEvents` `console.log` zabramkowany za `NODE_ENV!=="production"`.
- **Coverage (v8)** skonfigurowane — `npm run test:coverage` (pierwszy pomiar ~**42% statements**).
- **Dryf docs domknięty:** README · ARCHITECTURE · ENDPOINTS · ENV · ROADMAP · RLS.

**🔁 Pozostałe pozycje — rozpatrzone (#732–#733):**
- ✅ **Podział `KasynoClient.tsx`** (#732) — **ZROBIONE**: 1620 → 593 l. (sub-komponenty plansz + helpery → `kasyno/shared.tsx`) + 5 surowych `fetch` → `apiPost`/`apiGet`. Render `/kasyno` zweryfikowany.
- ⏸️ **Dekompozycja pozostałych 6 komponentów 600+ l.** — **świadomie NIE robione** (#733). Analiza strukturalna: w odróżnieniu od KasynoClient (kolekcja ~15 niezależnych sub-komponentów → czyste szwy), te są **spójne/stanowe** (RankingClient: 5 decl/9 hooków = jeden komponent; AdminClient: 72 decl ≈ **51 lazy-importów** = sekcje już wydzielone do osobnych plików). Ich rozmiar to nieodłączna logika renderu ze współdzielonymi danymi — podział wymusiłby **prop-drilling (gorszy smell)**, bez zysku poprawnościowego. Heurystyka „>600 linii" z audytu nie wskazuje tu realnego długu. Robić chirurgicznie przy następnym dotknięciu danej sekcji.
- ✅ **~101 ostrzeżeń React Compiler** — **purity/refs/immutability WŁĄCZONE** (#734, na życzenie właściciela), `set-state-in-effect` zostaje OFF (#733). Z 110: **12 niesetstate'owych rozwiązane** (2 fixy strukturalne — use-focus-trap ref→effect, OverlayClient self-ref→ref — + 9 celowych inline-disable na legalnych miejscach: server/handler Date.now, mutacje DOM/nawigacja w handlerach, żywy countdown) → **3 reguły egzekwowane jako `error`**. 98× `set-state-in-effect` zostaje OFF (idiomatyczny client data-fetching; kompilator bailuje; włączenie = 98 disable, zero zysku).
- ✅ **CSP `style-src 'unsafe-inline'`** — **UTWARDZONE** (#735, na życzenie właściciela): `unsafe-inline` **usunięte ze `style-src`**, ograniczone do **`style-src-attr`**. Wszystkie **30 inline `<style>` wyniesione** do CSS (`<link>`=`'self'`): keyframe'y → `globals.css`, 22 zduplikowane resety OBS → jeden `overlay/overlay.css` (import w layoutcie). Końcowo: `style-src 'self'` (elementy bez unsafe-inline) + `style-src-attr 'unsafe-inline'` (konieczne dla ~638 dynamicznych inline-atrybutów — CSP nonce/hash nie obejmują atrybutów stylu, wartości runtime-dynamiczne). Zweryfikowane na żywo: overlay body transparent, 8/8 keyframe'ów globalnie, 0 `<style>` w HTML, brak „Refused to apply inline style".
- 👤 **8 branchy dependabot + tag backup** — higiena **GitHub**, akcja właściciela (część to realne update'y bezpieczeństwa — eslint10/esbuild — do przejrzenia przed zamknięciem).

**👤 Akcje właściciela** (niemożliwe z kodu): potwierdź `ENCRYPTION_KEY` w env produkcyjnym Vercela; przejrzyj/zamknij branche dependabot.

> Sekcje 1–8 poniżej opisują stan **sprzed** remediacji (audyt na commit `6906324`).

---

## 1. Podsumowanie

Projekt jest **dojrzały i nieoczekiwanie czysty jak na swoją skalę** (~74 100 linii TS/TSX, 102 modele Prisma, 192 trasy API, 62 strony, 61 sekcji panelu, 622 testy jednostkowe). TypeScript działa w trybie `strict`, „furtek" typów jest śladowo (7× `: any`, 4× `as any`, **0×** `@ts-ignore`/`@ts-expect-error`), **0** martwych bloków kodu i **0** realnych `TODO/FIXME`. Bezpieczeństwo to **obrona w głąb**: brak zahardkodowanych sekretów, `.env` nigdy nie trafił do gita, brak wycieku `service_role` do klienta, **wszystkie** trasy admin/internal/bot są bramkowane uwierzytelnieniem, cztery webhooki płatności/eventów weryfikują podpis (`timingSafeEqual`), a sekrety są szyfrowane AES-256-GCM z separacją kluczy HKDF. **RLS jest włączony na wszystkich 102 tabelach** (potwierdzone na żywej bazie) — anon/PostgREST nie odczyta niczego.

Trzy najważniejsze ryzyka (wszystkie do utwardzenia, nie luki krytyczne): **(1)** rate-limiter i weryfikacja 2FA step-up **„fail-open"** — przy awarii Redis+DB lub dryfcie klucza szyfrowania ciche wyłączenie limitów/drugiego składnika, w tym na ścieżce globalnego resetu bazy; **(2)** jeden realny bug i18n — sekcja „Govee lighting" rzuca `MISSING_MESSAGE` w opisie (zła wielkość liter klucza); **(3)** dryf dokumentacji — README/ROADMAP/ARCHITECTURE podają nieaktualne liczby (477 vs 622 testy) i opisują dostarczone funkcje jako „w toku", a jedno zdanie README jest wprost nieprawdziwe („`ghost-empire-bot/` usunięty", a katalog istnieje).

**Werdykt:** projekt jest **blisko produkcyjnego** — w istocie już działa na produkcji (Vercel, auto-deploy z `main`), wszystkie 5 bramek lokalnych jest zielonych, a `npm audit` = **0 podatności**. Nie znaleziono **żadnego** wpisu Krytycznego. Do dopięcia pozostają: 1 widoczny bug i18n, kilka utwardzeń fail-closed, porządki w dokumentacji i higiena repo (8 martwych branchy dependabot). Brakująca konfiguracja pokrycia testów (coverage) to jedyna istotna luka w samej infrastrukturze jakości.

---

## 2. Tabela ustaleń

> Severity: **Krytyczny / Wysoki / Średni / Niski**. **Krytycznych: 0.**

| Severity | Obszar | Problem | Dowód (plik:linia / trasa / tabela) | Rekomendacja |
|---|---|---|---|---|
| **Wysoki** | Bezpieczeństwo / 2FA | **Step-up 2FA „fail-open" na ścieżce globalnego resetu bazy.** Gdy sekret TOTP admina nie da się odszyfrować (dryf `ENCRYPTION_KEY`), `requireStepUp` zwraca `{ok:true}` i pomija drugi składnik — także dla `reset-database` (globalny wipe) i dużych `grant-tokens`. Główna autoryzacja (`requirePlatformOwner`) nadal trzyma, więc to degradacja obrony w głąb, nie obejście logowania. | `src/lib/admin.ts:174-179`; ścieżka: `src/app/api/admin/reset-database/route.ts` | Dla ścieżki globalnego wipe’u **fail-closed**: przy nieodszyfrowywalnym sekrecie wymuś remediację klucza zamiast pomijać 2FA. Pozostałe akcje mogą zostać przy obecnym zachowaniu (nie blokować właściciela). |
| Średni | Bezpieczeństwo / rate-limit | **Rate-limiter „fail-open" domyślnie.** Przy awarii Redis+DB limiter zwraca `allowed:true` — anti-abuse na ścieżkach botowych/donacjach/gift/kasynie cicho znika na czas incydentu. | `src/lib/rate-limit.ts:62,134-142` | Akceptowalne dla tras DB-backed (zapis i tak padnie), ale ustaw `failClosed:true` na powierzchniach nie-DB (np. `bot/imagine` — koszt AI), by awaria nie zrobiła z nich wzmacniacza. |
| Średni | Dashboard / i18n | **Sekcja „Govee lighting" rzuca `MISSING_MESSAGE` w opisie.** Render liczy klucz dynamicznie `t(\`secDesc_${activeSection}\`)`; dla id `goverules` szuka `secDesc_goverules`, a w plikach jest tylko camelCase `secDesc_goveeRules`. Etykieta w nawigacji działa (`secGoveeRules`), psuje się tylko dymek opisu. Ta sama klasa co naprawiony #727. | trigger: `src/components/admin/AdminClient.tsx:354`; brak klucza: `src/messages/en.json:198` (jest `secDesc_goveeRules`, brak `secDesc_goverules`); poprawny wzorzec siostrzany: `en.json:351` (`secDesc_obsrules`) | Dodaj `secDesc_goverules` do **14 lokalizacji** (albo zmień nazwę `secDesc_goveeRules`→`secDesc_goverules`). |
| Średni | Bezpieczeństwo / rate-limit | **`daily-bonus` POST przyznaje GT bez rate-limitu.** Bezpieczne ekonomicznie (unikalny `externalId` blokuje podwójne odebranie), ale brak throttlingu na powierzchni spamu sesji. | `src/app/api/daily-bonus/route.ts:47` (brak `rateLimit()`); podobnie `profile/social-links`, `push/subscribe`, `notifications` POST | Dodaj per-user `rateLimit()` dla parytetu z resztą tras ekonomii. |
| Średni | Bezpieczeństwo / CSP | **`style-src 'unsafe-inline'`** w CSP (dla inline-style overlayów/kart) osłabia ochronę przed XSS. `script-src` jest poprawne (per-request nonce + `'strict-dynamic'`, bez `unsafe-inline`). | `src/proxy.ts:22` | Długofalowo: przenieś inline-style overlayów na klasy / nonce’owany `<style>` i usuń `unsafe-inline` ze `style-src`. |
| Średni | Jakość kodu | **Monster-komponent `KasynoClient.tsx` (1622 linie)** + 6 ręcznie pisanych `fetch(...)` omijających współdzielony `apiPost<T>()` (reszta repo — 56 plików — używa helpera). | `src/components/kasyno/KasynoClient.tsx:1` (rozmiar), handlery: `:1136,1151,1164,1176,1193,1224` | Rozbij na pliki per-gra; przepnij 6 handlerów na `lib/api-client.ts`. |
| Średni | Dokumentacja | **Liczba testów nieaktualna: „477" w 3 miejscach** vs faktyczne 622. | `README.md:142`, `README.md:193`, `docs/ARCHITECTURE.md:121` | Zaktualizuj do 622 lub zastąp frazą bez liczby (by przestało dryfować). |
| Średni | Dokumentacja | **Sprzeczność faktograficzna:** README mówi, że katalog `ghost-empire-bot/` „został **usunięty**", a istnieje na dysku; ARCHITECTURE (poprawnie) mówi „zostaje jako referencja". | `README.md:226` vs `docs/ARCHITECTURE.md:14` (+ `ls ghost-empire-bot/`) | Zrównaj README z rzeczywistością: „zdeprecjonowany/wyłączony, katalog pozostaje jako referencja". |
| Średni | Dokumentacja | **ROADMAP wciąż znakuje dostarczone jako TODO:** OBS WebSocket (#663–#665+#672) i Govee per-tenant (#720–#725) oznaczone 🟡/„NASTĘPNE" w sekcjach strukturalnych. Genuinie pozostaje tylko Philips Hue. | `ROADMAP.md:51,136,143,204,209`; `README.md:179` | Przełóż OBS WebSocket i Govee na ✅ / przekreśl; zostaw Hue jako pending. |
| Średni | Dokumentacja | **ENDPOINTS.md niedoszacowuje tras (187 vs 193) i pomija ≥4 istniejące:** `watch-streak`, `admin/role-roster`, `admin/subscribers`, `bot/welcome`. | `docs/ENDPOINTS.md:14` (nagłówek); pliki tras istnieją, `grep` w doc = 0 | Dodaj brakujące wiersze, popraw licznik lub usuń twardą liczbę. |
| Niski | Bezpieczeństwo | **`obs-control/config` zwraca odszyfrowane hasło OBS WebSocket** posiadaczowi tokenu overlayu (bez per-request auth). Zgodne z udokumentowanym modelem zaufania OBS Browser Source (token w URL, konsumowany na maszynie streamera). | `src/app/api/obs-control/config/route.ts:40,61` | Trzymaj tokeny overlayów rotowalne; overlaye są `noindex` (`next.config.ts:52`) — OK. |
| Niski | Bezpieczeństwo / crypto | **Dev-fallback klucza szyfrowania** (`"ghost-empire-dev-key"`) gdy `ENCRYPTION_KEY` i `NEXTAUTH_SECRET` oba nieustawione. Nieszkodliwe poza przypadkiem braku obu na produkcji. | `src/lib/crypto.ts:15-17` | Asercja na starcie: wymagaj jednego z kluczy w produkcji (fail-fast). |
| Niski | Bezpieczeństwo | **`bot/config` to publiczny GET bez auth** — zwraca cały `BotConfig`. Model **nie** ma pól sekretnych (tylko inty reward/cooldown/happy-hour), więc to tylko informacja. | `src/app/api/bot/config/route.ts:8`; `prisma/schema.prisma:832-851` | Bez akcji; odnotowane dla kompletności. |
| Niski | Jakość kodu | **`console.log` debug w kliencie** (2×) — diagnostyka flaky Kick API, ale leci do konsoli przeglądarki. | `src/components/admin/sections/KickEvents.tsx:70,87` | Zamień na `logger`/usuń lub gate’uj env-em dev. |
| Niski | Jakość kodu / lint | **~101 zduszonych ostrzeżeń React Compiler** (`set-state-in-effect`, `purity`, `immutability`, `refs` wyłączone w configu). Udokumentowane (kompilator bezpiecznie „bailuje"), ale to realny dług ukryty w configu. | `ghost-empire-web/eslint.config.mjs:24-31` | Świadomy przegląd: napraw wzorce setState-in-effect albo zostaw z jawną notą per-plik. |
| Niski | Testy | **Brak konfiguracji pokrycia (coverage)** w Vitest — zero widoczności na pokrycie linii/gałęzi. | `ghost-empire-web/vitest.config.ts` (brak `coverage`) | Dodaj provider `v8` + próg w CI. |
| Niski | Higiena repo | **8 martwych branchy `dependabot/*` na origin** (13 dni–3 tyg.) + 1 tag backup (3 tyg.). | `git branch -a` (esbuild, eslint-10, minor-and-patch ×3, upload-artifact); tag `backup-pre-risky-2026-06-05-2043` | Zmerguj/zamknij branche; usuń tag jeśli zbędny. |
| Niski | Dokumentacja | **README chwali się „0 `as any` w src"** — faktycznie są 4 (wszystkie uzasadnione). Drobny dryf. | `README.md:193` vs sweep (`auth.ts`, `chat-assets.ts:95`, `channels.ts`, `tenant-seed.ts`) | Zmień na „4 uzasadnione `as any`" lub usuń liczbę. |

---

## 3. Macierz rozbieżności dashboard ↔ kod

Parytet jest **bardzo ścisły.** Wszystkie **51 zarejestrowanych sekcji** ma komplet: człon unii `SectionId` + wpis w `SECTIONS` + lazy-import (lub komponent inline) + gałąź renderu + plik `sections/*.tsx` + klucze i18n `secX`/`secDesc_x`, a każdy manager woła realną trasę `/api/admin/**`. **Zero** „guzików bez akcji" (brak `onClick={() => {}}`, brak „coming soon"). **Zero** sierot (każda gałąź renderu mapuje na wpis rejestru i odwrotnie).

| Funkcja (sekcja) | W UI? (rejestr+render) | W kodzie? (komponent+trasa) | Aktualna? | Uwagi |
|---|---|---|---|---|
| **goverules** (Govee lighting) | ✅ unia, rejestr `:180`, render `:580` | ✅ `sections/GoveeRules.tsx` → `/api/admin/govee-rules` + `/api/admin/govee-test` | ⚠️ **NIE** | Brak `secDesc_goverules` → dymek opisu rzuca `MISSING_MESSAGE` (patrz §2/§5). Etykieta działa. |
| *(pozostałe 50 sekcji)* | ✅ | ✅ | ✅ | Pełna spójność: unia + rejestr + import + render + plik + `secX` + `secDesc_x`, każdy woła swoją trasę. |

**Niespójność konwencji (nie bug):** 3 sekcje mają etykiety camelCase (`secObsRules`, `secGoveeRules`, `secClipDirector`) odbiegające od lowercase-id — działają, bo etykieta to twarde `t("...")`. Psuje się tylko **dynamiczny** `secDesc_${id}` (powyżej `goverules`).

**Trasy admin bez UI (świadome, nie sieroty):**
- `…/api/admin/backfill-tenant` — jednorazowy helper migracyjny z devtools (`route.ts:13`), brak guzika z założenia.
- `…/api/admin/backup` — wołane przez `<a href>` w `sections/DatabaseReset.tsx:51` (download), nie `apiGet` — flagowane tylko dla jasności.

**Totale:** 51 zarejestrowanych sekcji · 61 plików `sections/*.tsx` (51 managerów + 10 sub-komponentów: ActiveDrops, CreateDrop, PendingOrders, GrantTokens, DatabaseReset, CodeDrops, CustomAlerts, ChatOverlay, ModViolationStats, RoleRoster, SupportPreview) · 77 tras `route.ts` pod `app/api/admin/**`.

> **Uwaga metodyczna:** macierz zbudowana **statycznie** (rejestr ↔ komponenty ↔ trasy ↔ i18n), nie z przeglądarki — patrz §8 „Luki w audycie", weryfikacja wizualna per-trasa nie była wykonana.

---

## 4. Stan usług

### Supabase (PostgreSQL) — sprawdzone na żywej bazie (read-only)
- **Tabele vs schema:** **102 tabele publiczne = 102 modele Prisma** — parytet 1:1, **brak tabel nadmiarowych ani brakujących**.
- **RLS:** **102/102 tabel ma RLS WŁĄCZONY, 0 wyłączonych.** Wszystkie w trybie **deny-all** (0 policy) → role anon/`authenticated` (PostgREST) nie odczytają niczego; aplikacja łączy się rolą **service** (omija RLS). To spójna, bezpieczna postawa dla appki, która **całość** dostępu do danych robi po stronie serwera i **nie** używa klienckiego klucza anon. Brak granularnych policy jest tu akceptowalny (nie ma klienta Supabase w przeglądarce).
- **Dryf doc:** `docs/RLS.md` deklaruje „97 tabel" — faktycznie 102 (doc **niedoszacowuje**, ale pokrycie jest pełne; nowsze tabele np. `song_request_bans` #729 doszły po #671).
- **Połączenie:** Supavisor pooler (Prisma 7 + `@prisma/adapter-pg`), pula `max:3`. `service_role`/`SUPABASE_SERVICE_ROLE_KEY` — **0 odwołań** w `src` (brak wycieku do klienta).

### Vercel — NIE zweryfikowane bezpośrednio (patrz §8)
- Vercel CLI **niezainstalowane** + brak tokenu → nie sprawdzono z konsoli: projektów, env (set/unset), historii deployów, logów buildów.
- Z repo: nagłówki bezpieczeństwa w `next.config.ts:14-40` + `src/proxy.ts:18-34` (HSTS preload, CSP z nonce, COOP, `X-Frame-Options: SAMEORIGIN`, Permissions-Policy, `poweredByHeader:false`), Vercel Analytics + Speed Insights wpięte, auto-deploy z `main`. Build produkcyjny **przechodzi** (268 tras skompilowanych — bramka z tej sesji zielona).
- **Akcja właściciela:** potwierdź, że `ENCRYPTION_KEY` jest ustawiony w env produkcyjnym (odsprzęga crypto at-rest od rotacji `NEXTAUTH_SECRET`).

### Upstash / cache / rate-limit
- **Własny** fixed-window limiter (nie `@upstash/ratelimit`): Upstash Redis (atomowy `INCR`+`PEXPIRE` Lua, `src/lib/rate-limit.ts:21-39`) z fallbackiem DB (`rateLimitBucket`). Klucze po stronie serwera (env). **66 plików tras** woła `rateLimit()`, w tym wszystkie kluczowe powierzchnie publiczne/abuse (auth/passkey, support/click, search, gt-games/*, shop/buy, gift, wheel/spin, predictions/*/wager, bot/*).
- **Słabość:** fail-open (§2). **Braki:** `daily-bonus`, `profile/social-links`, `push/subscribe`, `notifications` (webhooki bez RL są OK — bramkowane podpisem).

### Inne usługi (z configu/env, nazwy bez wartości)
- **Stripe** (`webhooks/stripe` — `constructEvent` podpis), **Sentry** (`SENTRY_DSN`), **web-push/VAPID**, **OAuth** Twitch/Kick/Discord/Google→YouTube, **Streamlabs** (polling), **Twitch EventSub** (HMAC + replay protection), **Kick** (RSA verify), **S3-like** przez `aws4fetch`. Sekrety: AES-256-GCM + HKDF (`src/lib/crypto.ts`), IV losowy 12B per-call, tag GCM weryfikowany, HMAC SHA-256 przez `timingSafeEqual`.

---

## 5. Bugi do odtworzenia

1. **`MISSING_MESSAGE` w opisie sekcji „Govee lighting".** (Średni — realny, widoczny)
   - **Kroki:** wejdź na `/admin` → wybierz sekcję **Govee lighting** (id `goverules`).
   - **Obserwacja:** linia opisu (💡) pod nagłówkiem woła `t("secDesc_goverules")`, którego **nie ma** w żadnej lokalizacji → next-intl zgłasza `MISSING_MESSAGE` (renderuje surowy klucz `admin.secDesc_goverules` / odpala handler błędu).
   - **Oczekiwane:** zlokalizowany opis, jak ma siostrzana sekcja `obsrules`.
   - **Dowód:** `src/components/admin/AdminClient.tsx:354` (dynamiczny `secDesc_${activeSection}`) + `src/messages/en.json:198` (jest tylko camelCase `secDesc_goveeRules`).
   - **Fix:** dodaj `secDesc_goverules` do 14 lokalizacji lub zmień nazwę istniejącego klucza.

2. **Cichy zanik rate-limitów przy awarii Redis+DB.** (Średni — behawioralny)
   - **Kroki (koncepcyjnie):** zasymuluj niedostępność Redis i DB → wywołaj dowolną trasę z `rateLimit()` bez `failClosed`.
   - **Obserwacja:** limiter zwraca `allowed:true` (fail-open) — limity anti-abuse nie działają na czas incydentu.
   - **Oczekiwane:** dla powierzchni nie-DB (np. `bot/imagine`) — odmowa (fail-closed).
   - **Dowód:** `src/lib/rate-limit.ts:62,134-142`.

3. **Pominięcie 2FA step-up przy dryfcie klucza.** (Wysoki — na ścieżce wipe’u)
   - **Kroki:** ustaw stan, w którym sekret TOTP admina jest nieodszyfrowywalny (np. `ENCRYPTION_KEY` zmieniony bez re-enkrypcji) → wywołaj akcję wymagającą step-up (`reset-database` / duży `grant-tokens`).
   - **Obserwacja:** `requireStepUp` zwraca `{ok:true}` — drugi składnik pominięty (główna autoryzacja właściciela nadal obowiązuje).
   - **Oczekiwane:** dla globalnego resetu — fail-closed + wymuszenie remediacji klucza.
   - **Dowód:** `src/lib/admin.ts:174-179`.

> Pozostałe pozycje z §2 to utwardzenia/dryfy, nie bugi z odtwarzalnym złym zachowaniem runtime.

---

## 6. Top usprawnień (posortowane wg korzyść/koszt)

| # | Usprawnienie | Nakład | Uzasadnienie |
|---|---|---|---|
| 1 | **Napraw klucz i18n `secDesc_goverules`** (14 lokalizacji) | **S** | Jedyny widoczny bug w panelu; trywialna poprawka, ta sama klasa co #727. |
| 2 | **Domknij dryf docs:** README testy 477→622 (×2) + „bot usunięty"→„referencja" + dodaj Rumble + „~46"→51 sekcji + „0 as any"→„4"; ENDPOINTS licznik+braki; ROADMAP OBS/Govee→✅ | **S** | Najwyższy stosunek sygnał/koszt — dokumentacja to wizytówka i kontrakt; teraz wprowadza w błąd. |
| 3 | **Dodaj coverage do Vitest** (`v8` + próg w CI) | **S** | Zero widoczności pokrycia przy 622 testach; tani wgląd + zapobiega regresjom. |
| 4 | **Asercja `ENCRYPTION_KEY`/`NEXTAUTH_SECRET` na starcie** (fail-fast) | **S** | Eliminuje cichy dev-fallback klucza w produkcji (`crypto.ts:15-17`). |
| 5 | **Dodaj `rateLimit()` do `daily-bonus`** (+ `profile/social-links`, `push/subscribe`) | **S** | Parytet anti-abuse; unikalny `externalId` chroni ekonomię, ale nie sesję. |
| 6 | **Fail-closed na powierzchniach nie-DB** (`bot/imagine`) **i na `reset-database` step-up** | **M** | Zamyka dwa „fail-open" o realnym koszcie (AI/koszt + globalny wipe). |
| 7 | **Rozbij `KasynoClient.tsx`** (1622 l.) na pliki per-gra + przepnij 6 `fetch` na `apiPost` | **M** | Największy plik repo + jedyny omijający współdzielony helper; łatwiejszy maintainability/testowalność. |
| 8 | **Posprzątaj repo:** zmerguj/zamknij 8 branchy dependabot, usuń tag backup | **M** | Mniej szumu w origin; aktualizacje bezpieczeństwa (eslint 10, esbuild) podjęte świadomie. |
| 9 | **Zdekomponuj 6 komponentów 600+ l.** (Profile/Admin/Ranking/Home/Events/u[username]) | **M** | Rozmiar utrudnia review i react-compiler; brak pojedynczych funkcji >150 l. → da się dzielić bezpiecznie. |
| 10 | **Przegląd ~101 zduszonych ostrzeżeń React Compiler** + migracja inline-style overlayów z CSP `style-src 'unsafe-inline'` | **M** | Zdejmuje ukryty dług i domyka ostatnią słabość CSP. |

---

## 7. Higiena repo

- **Git:** drzewo czyste, `main` = `origin/main` (0/0), najnowszy commit `6906324` (#730). Konwencja: bezpośredni push do `main` (brak PR-ów GitHub — `gh` niedostępne), numeracja #NNN prowadzona ręcznie.
- **Branche do zamknięcia (8, origin):** `dependabot/github_actions/actions/upload-artifact-7`, `dependabot/npm_and_yarn/ghost-empire-{bot,chat,web}/…` (esbuild-0.28.1, eslint-10.4.1, minor-and-patch ×3) — wiek 13 dni–3 tyg. Zmerguj lub zamknij.
- **Tagi:** 1 — `backup-pre-risky-2026-06-05-2043` (3 tyg.). Usuń jeśli zbędny.
- **CHANGELOG:** **aktualny i wzorowo prowadzony** — `[Unreleased]` odzwierciedla #727–#730; `docs:check` wymusza sync (zielony, „latest #730"). Bez zastrzeżeń.
- **ROADMAP:** nota „🆕 Świeżo dowiezione" aktualna, ale **sekcje strukturalne stare** — OBS WebSocket i Govee wciąż jako 🟡/„NASTĘPNE" mimo dostarczenia (patrz §2). Realnie pending: tylko Philips Hue + F4 AI (czeka na klucz).
- **README:** kilka dryfów (testy 477, „bot usunięty", „~46 sekcji", „0 as any", „11 overlayów" vs 23, brak Rumble) — patrz §2/§6. Instrukcja uruchomienia **poprawna** wzgl. `package.json` (`npm run dev` → :3000; uwaga: lokalny launch używał :3100, ale `.claude/launch.json` **nie istnieje** w repo).
- **Backlog:** rolę pełnią ROADMAP + `docs/IDEAS.md` — częściowo nieodzwierciedlają stanu (jw.).
- **Zależności:** `npm audit` = **0 podatności**; `npm outdated` = 2 (eslint 9→10 — świadomie wstrzymane, `eslint-config-next` 16 nie wspiera; next-auth v5 beta — celowo).

---

## 8. Luki w audycie

- **Faza 2 — weryfikacja wizualna per-trasa: NIE wykonana.** Uruchomienie dev servera wymagałoby (a) **utworzenia `.claude/launch.json`** (łamie regułę „jedyny tworzony plik to `AUDIT_REPORT.md`" — w repo go nie ma) oraz (b) połączenia z **żywą bazą**. Zamiast tego oparłem integralność tras na **zielonym buildzie produkcyjnym** (kompiluje wszystkie 268 tras) + **statycznym parytecie dashboard↔kod** (51 sekcji wpiętych, 0 no-op, 0 sierot). Render per-trasa (zwłaszcza panel za auth) **pozostaje niezweryfikowany wizualnie** — mogę to zrobić w osobnym, nie-read-only przebiegu, jeśli zechcesz.
- **Vercel:** brak CLI + tokenu → projekty/env/deploye/logi buildów niedostępne z konsoli. Stan zmiennych w produkcji (zwł. `ENCRYPTION_KEY`) = akcja właściciela.
- **Pokrycie testów:** niekonfigurowane w Vitest → brak liczby pokrycia linii/gałęzi; podano liczności (79 plików / 622 testy jednostkowe; 5 integracyjnych na realnym Postgresie w CI; 1 e2e Playwright `e2e/smoke.spec.ts`).
- **Martwy kod / nieużywane eksporty:** pełny sweep wymagałby `ts-prune`/`knip` (nieuruchamiane); spot-checki czyste.
- **Żywa baza:** tylko odczyt (flagi RLS, lista tabel, weryfikacja 1 kolumny). Nie analizowano danych, kompletu indeksów ani wydajności zapytań. Zapytanie RLS uruchomiono **tymczasowym, natychmiast usuniętym** skryptem read-only (pg-adapter) — bez trwałego artefaktu, bez mutacji.
- **Sekrety w dashboardach** (Vercel/Supabase/Upstash): odwołano się tylko do **nazw** zmiennych z kodu; faktyczny stan set/unset w produkcji = akcja właściciela.
- **Integracje zewnętrzne** (Twitch/Kick/YouTube/Stripe/Streamlabs) sprawdzone **statycznie** (weryfikacja podpisów, gating) — nie testowano end-to-end z żywymi callbackami.

---

*Raport wygenerowany w trybie read-only. Nie zmieniono kodu, nie wykonano commitów, deployów ani migracji. Jedyny utworzony plik: `AUDIT_REPORT.md`.*
