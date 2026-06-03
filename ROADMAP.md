# 🗺️ Ghost Empire — Roadmap & propozycje optymalizacji

Jeden plik na **wszystko, co dalej**: kolejne features, hardening, optymalizacje wydajności/bezpieczeństwa, dług techniczny i pomysły „kiedyś”. Konsolidacja propozycji usprawnień, żebyśmy nic nie zgubili między sesjami.

- Co JUŻ jest → [README.md](README.md) (features) + [CHANGELOG.md](CHANGELOG.md) (per data)
- Phase 2 (zamknięte) → [PHASE2.md](PHASE2.md)
- Plan chat bota i engagement → [PHASE3.md](PHASE3.md)

> **Legenda:** 🔥 wysoki priorytet · 🟡 średni · 🧊 nice-to-have / „kiedyś” · ⛔ świadomie odroczone (z powodem)

---

## 0. Następny duży krok

**Phase 3A (chat bot) + 3B (engagement) = ✅ ZROBIONE** (2026-05-30) — bot na Twitch/Kick/YouTube z komendami z portalu, timerami, FAQ, powitaniami, song requests i chat overlayem OBS. Szczegóły: [CHANGELOG.md](CHANGELOG.md) + [PHASE3.md](PHASE3.md).

**Następny duży krok: Phase 3C → 3D** (pełna specyfikacja w [PHASE3.md](PHASE3.md)):
- **3C — alerts upgrade + hardware:** customizacja alertów per-typ (animacja/font/grafika/dźwięk/threshold), **OBS WebSocket** (przełączanie scen/źródeł), **Philips Hue / Govee / Lumia** (efekty świetlne na donejty).
- **3D — AI + analityka:** **AI Moderator**, AI auto-responses kontekstowe, AI shoutouts/clip-detection, ~~Subathon/Goalathon~~ ✅ (#17), analityka per-stream + heatmapy czatu, A/B testy komend.
- **Drobne dopięcia chat-bota:** dynamiczne daily questy z aktywności czatu, walidacja YouTube API w song requests, bonus tokenów przy powitaniu, **hosting bota 24/7** (Railway/VPS zamiast PC + Dockerfile).

> Decyzja przed 3C: priorytet (alerty vs hardware vs AI). Hardware (Hue/Govee) wymaga kont developerskich + ewentualnie lokalnego mostka.

---

## 1. Jakość kodu, testy i CI/CD 🔥

Pierwsza warstwa domknięta: **są już testy jednostkowe (Vitest) i CI (GitHub Actions)** — patrz CHANGELOG. Zostają warstwy wyżej: testy integracyjne (API + DB) i E2E.

| Propozycja | Pri | Notatki |
|---|---|---|
| ~~**Testy jednostkowe** (Vitest)~~ ✅ | — | **Zrobione** — czysta logika bez DB w `lib/economy.ts` + `src/lib/__tests__/`: payout predictions, tier battle passa, konwersja walut, poziomy/rangi, polska pluralizacja, podpisy webhooków + świeżość, nagłówki rate-limitera |
| **Testy integracyjne** API routes | 🔥 | Następny krok testów: Prisma na testowej bazie (Supabase branch lub Docker Postgres), kluczowe: ekonomia + webhooki |
| **E2E** (Playwright) | 🟡 | Happy path: login → zarobek → zakup w sklepie; smoke testy publicznych stron |
| ~~**GitHub Actions CI**~~ ✅ | — | **Zrobione** — `.github/workflows/ci.yml`: typecheck + lint + test na push/PR. `next build` zostaje po stronie Vercela (preview deploy na każdym pushu) |
| **Lighthouse CI / performance budget** | 🟡 | Wykrywanie regresji Core Web Vitals na publicznych stronach |
| ~~**Dependabot**~~ ✅ | — | **Zrobione** — `.github/dependabot.yml`: cotygodniowe zgrupowane PR-y (web/chat/bot + actions), security-updaty natychmiast |
| **Prettier + import sort** | 🧊 | Spójny styl; dziś tylko ESLint |
| **`@typescript-eslint` (surowsze reguły TS)** | 🧊 | Lint = **ESLint 9 flat config** z `eslint-config-next/core-web-vitals`. Zostaje: surowsze reguły TS. ⛔ **ESLint 10** zablokowany — `eslint-config-next` 16 + pluginy jeszcze go nie wspierają (`scopeManager.addGlobals is not a function`); czekamy na release zgodny z ESLint 10 |

---

## 2. Monitoring i observability 🔥

Dziś diagnostyka = logi Vercela. Pod produkcję z realnym ruchem to za mało.

| Propozycja | Pri | Notatki |
|---|---|---|
| **Sentry** (error tracking) | 🔥 | Client + server + edge; już mamy `error.digest` w boundary do korelacji |
| **Vercel Analytics + Speed Insights** | 🟡 | Realne Core Web Vitals z produkcji, mały koszt integracji |
| **Structured logging** | 🟡 | ✅ `lib/logger.ts` (JSON+poziomy, `LOG_LEVEL`, +5 testów) wpięty w `twitch-eventsub`. Zostaje adopcja w kick-events / paymedia / cron / award (ten sam wzorzec) |
| **Uptime / health-check** | 🟡 | Endpoint `/api/health` + zewnętrzny monitor (cron-job.org / UptimeRobot) na live + bazę |
| **Alerty na anomalie ekonomii** | 🧊 | Nietypowe skoki grantów/odbić → notyfikacja admina (anti-abuse) |

---

## 3. Wydajność (kolejne kroki) 🟡

Dużo już zrobione (cache, indeksy, lazy admin, `staleTimes`, równoległe zapytania — patrz CHANGELOG). Następne:

| Propozycja | Pri | Notatki |
|---|---|---|
| **React Compiler** | ⛔ | Świadomie odroczony — auto-memoizacja. Reguły lintu (`react-hooks` v7) są już w configu po migracji Next 16 (**wyłączone** — flagują nasze wzorce). Wrócić, gdy będzie warto (po testach) |
| **`next/image` po wyjściu z Hobby** | 🟡 | Dziś natywne lazy `<img>` (oszczędność quoty optymalizatora). Po Pro warto przemierzyć na `next/image` (AVIF/WebP, auto-srcset) |
| **Audyt rozmiaru bundla** | 🟡 | `@next/bundle-analyzer`; `AdminClient.tsx` jest monolityczny i ciężki — kandydat do code-split per sekcja |
| **Streaming / Suspense granice** | 🧊 | Progresywny render ciężkich list zamiast pełnego SSR-blokowania |
| **Redis/Upstash dla rate-limit + cache** | 🧊 | Dziś DB-backed (fail-open). Przy skali wynieść do Redisa (mniejszy narzut na Postgres) |
| **Tuning połączeń DB** | 🟡 | `connection_limit`/`pool_timeout` w Vercel env (patrz CHANGELOG — wymaga ręcznej zmiany przez usera) |

---

## 4. Bezpieczeństwo (kolejne kroki) 🟡

Solidna baza (HSTS, CSP, COOP, rate-limit, webhook verify, audit log — patrz CHANGELOG). Co dociągnąć:

| Propozycja | Pri | Notatki |
|---|---|---|
| **CSP nonces — usunięcie `unsafe-inline`/`unsafe-eval`** | 🔥 | Najważniejsze utwardzenie CSP. Wymaga nonce middleware Next.js + przepięcia inline styli/skryptów. Ryzyko regresji → osobna sesja z testami |
| **2FA / step-up dla akcji admina** | 🟡 | Wrażliwe akcje (grant dużych kwot, merge, ban) za dodatkowym potwierdzeniem |
| **Audyt zależności** | 🟡 | `npm audit` w CI + Dependabot (patrz §1) |
| **Rotacja sekretów + skan** | 🟡 | ✅ skan: **GitGuardian** (zintegrowany, przechodzi na PR). Zostaje: udokumentowany proces rotacji `BOT_SECRET`/OAuth |
| **Rate-limit per-IP na publicznych stronach** | 🧊 | Dziś per-user na ekonomii; dorzucić warstwę edge/IP na publicznych GET-ach |

---

## 5. Dostępność (a11y) i UX 🟡

| Propozycja | Pri | Notatki |
|---|---|---|
| **Audyt a11y** (axe / Lighthouse) | 🟡 | ✅ focus-visible, nawigacja klawiaturą, `aria-label` na navach, `aria-current`, **`role="dialog"`+`aria-modal` na modalach edytorów** (A4 + a11y passes). Zostaje: kontrast (czerwień na czerni), reszta modali/dropdownów |
| ~~**Skip-to-content + landmarki**~~ ✅ | — | **Zrobione** — skip-link „Przejdź do treści" (A4) + `<main>` per-strona + opisane nawigacje/stopka |
| **i18n (PL/EN)** | 🧊 | W seedzie jest już `textEn` dla questów — fundament pod angielską wersję dla widzów zza granicy |
| ~~**Empty/error states**~~ ✅ | — | **Zrobione** — `EmptyState` (Ankiety / Eventy / Questy / Ranking / Osiągnięcia / Predykcje) + `ErrorState` z retry (LazySection admina). Pozostałe listy — opcjonalnie iteracyjnie |
| **OG images — dopieszczenie** | 🧊 | Wzbogacić share-preview (np. dynamiczne tła per ranga/tier) |

---

## 6. Backlog produktowy (engagement) — z Phase 3B/3C/3D 🟡

Pełne specyfikacje w [PHASE3.md](PHASE3.md). Skrót tego, co jeszcze NIE zrobione:

- **3B:** ✅ **zrobione w całości** (Song Requests, Chat overlay, Timery, FAQ, Welcome) + ~~dynamiczne daily questy z czatu~~ #19, ~~tytuły song requestów (oEmbed)~~ #18, ~~bonus tokenów przy powitaniu~~ #16
- **3C:** customizacja alertów per-typ (animacja/font/grafika/dźwięk/threshold), **OBS WebSocket** (sceny/źródła), **Philips Hue / Govee / Lumia** (efekty świetlne na donejty)
- **3D:** **AI Moderator**, AI auto-responses kontekstowe, AI shoutouts/clip-detection, ~~Subathon/Goalathon~~ ✅ (#17), analityka per-stream + heatmapy czatu, A/B testy komend
- **Game library** (Steam/Roblox + opcjonalnie Xbox/Battle.net) + voting widget „następna gra”

### Pomysły użytkownika (2026-05-30) — do zrealizowania

- ✅ **Customizacja alertów** (T16) — podgląd na żywo + rozmiar/kolor tekstu (#24, #25) **oraz per-typ**: animacja / pozycja / własny dźwięk / próg kwotowy osobno dla każdego typu alertu (`AlertTypeConfig`, `/admin#alerts`). **ZROBIONE w całości.**
- 🔥 **OBS WebSocket — hasło wklejane na stronie** (`/admin`), nie w env → przeżywa zmianę komputera (kopiuj-wklej)
- 🔥 **Strona startowa (landing)** — ładny pierwszy ekran przy wejściu (wariacja na temat `/about`)
- 🟡 **Changelog na stronie `/about` jako zwijana lista** — mniej miejsca, rozwijane po szczegóły
- ✅ **Opisy uprawnień w UI nadawania rang** (`/admin#users`) — opis „co daje" + tooltip pod każdym uprawnieniem (`MOD_PERMISSIONS.desc`). **ZROBIONE.**
- 🟡 **Profil: „czas spędzony na streamie"** — wymaga trackingu sesji streamu (Twitch `stream.online/offline`)
- 🟡 **Wybór dostawcy donacji** — nie tylko Streamlabs; wybór platformy w panelu (każdy dostawca = osobna integracja)
- 🟡 **AI Moderator — wybór modelu/dostawcy** (Anthropic / OpenAI / Google), nie tylko jeden — abstrakcja providera + setting
- ✅ **Ankiety / głosowania** na stronie — **ZROBIONE**: `/polls` (głosowanie + wyniki na żywo) + `/admin#polls` (tworzenie/zamykanie/usuwanie). Modele `Poll`/`PollVote`.
- 🧊 **Integracje:** Rumble, Trovo, Instagram, Facebook, X, TikTok
- 🧊 **Redesign / lepszy layout** — czytelność, przejrzystość, mniej męczący dla oka + zmiana grafiki

> ✅ Już zrobione z tej puli: **cały chat bot 3A + rdzeń 3B** (timery / FAQ / powitania / song-requests / chat-overlay), Stream Goals + Hype Train, Predictions, Battle Pass/Sezony (patrz [CHANGELOG.md](CHANGELOG.md) + [PHASE3.md](PHASE3.md)).

### Pomysły użytkownika (2026-06-03) → świeży podział na fazy w [PLAN.md](PLAN.md)

Po modernizacji stacku do najnowszych majorów rozpisana **Faza A** (autonomiczna, bez kluczy) → B (decyzje techniczne) → C (🔑 creds) → D (🎨 redesign) → E (moonshot). Pełen rozpis: [PLAN.md](PLAN.md).

- ✅ 🤖 **Eventy: „Aktywne" + „Edycja" scalone** *(prośba usera)* — jedna karta „Eventy" w `/admin#events` (lista wszystkich eventów + Wylosuj/ON-OFF/Edit w wierszu, liczniki uczestników, reaktywacja dezaktywowanych). **Faza A #1.**
- ✅ 🤖 **EmptyState na Sklepie + Home** — sygnaturowy pusty stan na publicznych widokach (`/shop` + widget eventów na stronie głównej). **Faza A #5 (część publiczna).**
- ✅ 🤖 **a11y — ARIA na popoverach** — dzwonek powiadomień (`role="dialog"`/`aria-expanded`) + menu konta (`aria-haspopup`). **Faza A #5 (a11y).** Zostaje już tylko kontrast czerwień/czerń.
- ⏸️ 🤖 **„Czas na streamie" + analityka per-stream** — odłożone na prośbę usera (rusza żywą bazę + subskrypcje Twitch; po „czystym kodzie"). EventSub mierzy tylko czas nadawania, nie per-widz.
- 🤖 **Faza A do zrobienia:** komendy warunkowe (`requiresLive`/`minViewers`) · code-split `AdminClient` + bundle-analyzer · i18n PL/EN · testy integracyjne+E2E · structured logging · kontrast a11y.

### Pomysły użytkownika (2026-06-02) → kolejność i szczegóły w [PLAN.md](PLAN.md)

- ✅ 🤖 **Chat overlay — customizacja wiadomości** — **ZROBIONE**: rozmiar / kolor / czcionka / krycie tła / ikona platformy w `/admin#chat`, na overlayu i w podglądzie na żywo (`ChatOverlayConfig`).
- ✅ 🤖 **Stream Alerts — własne (customowe) alerty** — **ZROBIONE**: admin tworzy własny alert (nazwa / tytuł / treść / ikona / kolor / liczba) w `/admin#alerts` i wyzwala go ręcznie na overlayu; podgląd na żywo (`CustomAlert`).
- 🤖 **Profil — poprawne nicki Kick/YouTube** (Kick z realnego handle przy logowaniu; handle YouTube z YouTube Data API).
- 🔑 **Interaktywne social linki (OAuth „połącz jednym kliknięciem")** — IG / TikTok / X / Facebook (aplikacje deweloperskie + przegląd); Twitch / Kick / YouTube już mają OAuth.
- 🎨 **„Repo jak arcydzieło"** — iteracyjny, bezpieczny polish wizualny + wykorzystanie dostarczonych grafik (bez globalnego refactora layoutu — sidebar odrzucony).
- ✅ **Naprawione bugi:** audit log (nick zamiast imienia + „konto usunięte" zamiast `#cuid`), przycisk wyloguj w profilu, menu konta klik-toggle (wyloguj na mobile), nicki w nagłówku / profilu publicznym.

### Pomysły użytkownika (2026-06-01)

> Legenda autonomii: 🤖 = robię sam, bez Twojej interwencji · 🔑 = wymaga Twoich kont deweloperskich / kluczy API.

**✅ Zrobione w tej sesji (admin UX pass):**
- ✅ **Szybsze nadawanie rang i punktów** — lookup usera jednym zapytaniem `OR` zamiast 3 sekwencyjnych, notyfikacja + audit równolegle (`Promise.all`). Toast z wynikiem pojawia się od razu.
- ✅ **Stały admin po emailu** — `dzierzawskii98.dam@gmail.com` jest ZAWSZE adminem (hardcode w `auth.ts`, przeżywa reset bazy; dodatkowe maile przez `ADMIN_EMAILS`).
- ✅ **Czytelniejszy audit log** — „**nick admina → akcja → nick obiektu**" zamiast etykiety + skróconego cuid.

**🤖 Następne (autonomiczne — priorytet wg kolejności):**
- ✅ 🤖 **Reset bazy danych z panelu** (`/admin#users`, tylko admin) — **ZROBIONE**: „strefa niebezpieczna" z frazą `USUŃ WSZYSTKO` + natywny `confirm`; kasuje userów i całą ich aktywność (kaskady FK + jawne usuwanie tabel bez FK do User) oraz efemerydy (alerty/feed/logi), zostawia konfigurację, katalog i audit log. Stały admin wraca po ponownym logowaniu. *(Endpointu sam nie uruchamiam.)*
- ✅ 🤖 **Drops — losowe kody** — **ZROBIONE**: pula kodów w `/admin#drops` (hurtowe wklejanie), overlay `/overlay/codes?token=` losuje i pokazuje jeden co X czasu (każdy wejdzie zanim się powtórzy), z **podglądem na żywo** + URL do OBS. Modele `StreamCode`/`CodeDropConfig`, współdzielony `CodeCard`.
- ✅ 🤖 **Uniwersalne podglądy „jak w OBS"** — **ZROBIONE**: podgląd + URL z kopiowaniem w sekcjach Stream Goals, Subathon i Chat overlay (`OverlayPreview` + współdzielone `GoalBar`/`SubathonCard`/`ChatMessageRow`; żywe overlaye repointowane na te same komponenty). Alerty i drop kodów już miały.
- ✅ 🤖 **Battle Pass — nagrody rzeczowe** — **ZROBIONE**: typy nagród `item` / `code` obok `tokens`/kosmetyki; kod pokazywany graczowi po odebraniu, `item` = odbiór przez ticket. Sterowane w `/admin#seasons`, bez zmiany schematu.
- ✅ 🤖 **Osiągnięcia — własne + nagrody rzeczowe** — **ZROBIONE**: sekcja `/admin#achievements` (CRUD + ręczne przyznawanie userowi); `Achievement.rewardNote` = nagroda rzeczowa (kod / przedmiot / rola) pokazywana w powiadomieniu obok XP/GT. **→ całe #4 (sklep + battle pass + osiągnięcia) domknięte.**
- ✅ 🤖 **Sklep — zdjęcia + warunki odblokowania** — **ZROBIONE**: grafika przedmiotu (`imageUrl`, URL) + odblokowanie przez **osiągnięcie** (`requiresAchievement`, egzekwowane przy zakupie + plakietka na `/shop`) + wyeksponowane wymagania (level / sub tier / mc subskrypcji) w edytorze. *(Upload pliku zamiast URL = wymaga storage; progi liczbowe „followers/subów" jako osobne warunki — opcjonalnie później.)*
- ✅ 🤖 **Eventy okolicznościowe** — **ZROBIONE**: szablony świąteczne (Dzień Kobiet / Walentynki / Wielkanoc / Halloween / Boże Narodzenie / Sylwester) odpalane jednym kliknięciem w `/admin#events` (happy hour z mnożnikiem albo giveaway). *(Auto-harmonogram dat — opcjonalnie później; dziś odpalasz ręcznie kiedy chcesz.)*

> ✅ **Wszystkie autonomiczne (🤖) pozycje z listy 2026-06-01 zrobione.** Zostają tylko pozycje 🔑 (wymagają Twoich kluczy/kont): social OAuth (IG/TikTok/FB/X), AI moderator (klucz API), OBS WebSocket / Hue / Govee.

**🔑 Wymaga Twoich kont/creds (zostawiam na koniec):**
- 🟡 🔑 **Social Linki interaktywne (OAuth)** — łączenie Instagram / TikTok / Facebook / X jednym kliknięciem, tak jak Twitch/Kick. Każda platforma wymaga **zarejestrowanej aplikacji deweloperskiej** (client id + secret), a IG/TikTok dodatkowo przeglądu/akceptacji. Bez tego przygotuję gotowe UI „Połącz" czekające na creds. *(Twitch / Kick / Discord / Google→YouTube już działają interaktywnie.)*
- 🟡 🔑 **AI Moderator — wybór modelu** (Anthropic / OpenAI / Google) — abstrakcja providera + klucz API.
- 🟡 🔑 **OBS WebSocket (hasło wklejane na stronie) + Hue / Govee** — hasło/konta deweloperskie hardware.

> Sekrety (klucze API, hasła): **nie wklejaj ich na czacie** — wrzuć je sam do **Vercel → Settings → Environment Variables** (portal) lub gitignored `.env` (bot). Podam dokładne nazwy zmiennych przy każdej funkcji. Cokolwiek już gdziekolwiek wkleiłeś — zrotuj.

---

## 7. Moonshot — Phase 4+ 🧊

Każde to osobny projekt (tygodnie+), część wymaga lokalnego mostka (Electron):

- NFT / kolekcjonerskie odznaki (blockchain wallet)
- Voice commands (lokalny mic listener)
- TikTok / YouTube Shorts auto-upload
- Razer Chroma / Corsair iCUE / Logitech G / SteelSeries / Elgato SDK (Electron bridge per SDK)
- Stream Deck plugin
- Multi-platform unified chat bridge (Twitch = Kick = YT na żywo)

---

## 8. Infra / wyjście z Vercel Hobby 🟡

Część features jest dziś ograniczona planem Hobby:

| Ograniczenie Hobby | Skutek dziś | Po upgrade (Pro) |
|---|---|---|
| Brak websocketów | Overlay + notyfikacje przez polling | SSE/WS → niższe opóźnienia, mniej zapytań |
| Cron tylko daily | Streamlabs polling 1×/dzień | Częstszy polling donacji / quest reset |
| Funkcje max 10 s | Ciężkie operacje trzeba dzielić | Większe batch-e, mniej obejść |
| Limit optymalizatora obrazów | Natywne `<img>` zamiast `next/image` | Pełny `next/image` (§3) |

> Pełny rozpis ograniczeń: notatka pamięci „vercel-hobby-constraints”.

---

_Aktualizuj ten plik razem z CHANGELOG za każdym razem, gdy coś z roadmapy ląduje na produkcji albo gdy pojawia się nowy pomysł na usprawnienie._
