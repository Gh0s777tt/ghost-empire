# 🗺️ Ghost Empire — Roadmap & propozycje optymalizacji

Jeden plik na **wszystko, co dalej**: kolejne features, hardening, optymalizacje wydajności/bezpieczeństwa, dług techniczny i pomysły „kiedyś”. Konsolidacja propozycji usprawnień, żebyśmy nic nie zgubili między sesjami.

- Co JUŻ jest → [README.md](README.md) (features) + [CHANGELOG.md](CHANGELOG.md) (per data)
- Phase 2 (zamknięte) → [PHASE2.md](PHASE2.md)
- Plan chat bota i engagement → [PHASE3.md](PHASE3.md)

> **Legenda:** 🔥 wysoki priorytet · 🟡 średni · 🧊 nice-to-have / „kiedyś” · ⛔ świadomie odroczone (z powodem)

---

## 0. Następny duży krok

**Phase 3A–3D + „Studio" (F1–F3, F5) = ✅ ZROBIONE.** Bot na Twitch/Kick/YouTube (komendy/timery/FAQ/powitania/song requests/chat overlay), alerty per-typ, subathon, analityka+heatmapy, **moderacja czatu (automod)**, **biblioteka+generator widgetów**, customizacja (kolory/czcionki/gradienty/emotki), UX (grupowana nawigacja, `Ctrl+K`, checklista, panel integracji). Szczegóły: [CHANGELOG.md](CHANGELOG.md) + [PLAN.md](PLAN.md).

**F4 — AI** (klucz w Vercel env / `/admin#integrations`):
- ✅ **Postać `@bot` + `!imagine`** **(#166)** — zbudowane (`lib/ai.ts` multi-provider, endpointy `/api/bot/ai-reply`+`/api/bot/imagine`, bot `aiCommands.ts`). **⚠️ Klucze AI ważne, ale konta bez quota na completions (OpenAI/Gemini/Deepseek 429/400)** → aktywne po doładowaniu dostawcy + restarcie bota.
- 🟡 **AI-moderacja** (toksyczność przez API) jako rozszerzenie automoda — następny krok (ten sam `lib/ai.ts`).
- 🟡 Wybór persony/modelu w panelu (dziś persona w kodzie, model/dostawca w `IntegrationConfig`).

> **🆕 Świeżo dowiezione (2026-06-05, PR #146–#157):** 🎰 **Koło Fortuny** (moduł `/wheel` + overlay OBS + panel) · 🔐 **szyfrowanie sekretów at-rest** (klucze API #146, tokeny OAuth #147) + nagłówki overlay #148 · 💬 **prawdziwe odznaki Twitch + emotki 7TV/BTTV/FFZ** #149 · 🧹 cron czyszczący bazę #151 · 🎲 predictions auto-close + announce #152 · 🛡️ **eskalacja moderacji recydywistów + statystyki** #153 · 📊 **Vercel Analytics + Speed Insights** #155 · 🔎 `npm audit` w CI #156 · 🔗 **webhooki wychodzące** (Discord/n8n/custom) #157 · 📄 runbook rotacji sekretów.

> **🆕 Świeżo dowiezione (2026-06-06, PR #173–#184):** ✦ **prestiż (Phantom Ascension)** #173 + perk GT · 🛒 zniżka w sklepie #174 · ⚔️ **pojedynki PvP `!duel`** #175–176 · 🔊 TTS na alertach #180 · 🏆 osiągnięcia (prestiż/pojedynki/kasyno) #179 · 🏦 **napad kooperacyjny `!heist`** #181 · 🎡 **ruletka `!roulette`** #182 · 🧭 grupowana nawigacja #183 · 💬 **Discord wydzielony do osobnego `E-Bot`** (`Gh0s777tt/E-Bot`), `ghost-empire-bot` zastąpiony #184. **Podział finalny:** `ghost-empire-chat` = streaming · **E-Bot** = Discord + społeczność.

**Pozostałe duże kierunki:**
- **F6 — security/backup** (zrobione: backup JSON, sanityzacja URL, ✅ **szyfrowanie sekretów at-rest AES-256-GCM**, ✅ **nagłówki overlay `noindex`/`no-store`**, ✅ **cron czyszczący bazę**). Zostaje: auto-backup `pg_dump` na osobny bucket (decyzja: dokąd), AV uploadów.
- **Hardware (3C):** OBS WebSocket (panel integracji już przyjmuje adres+hasło), Philips Hue / Govee (efekty świetlne na donejty) — konta dev.
- ✅ **Emotki 7TV/BTTV/FFZ + prawdziwe grafiki odznak** — zrobione (#149).
- **i18n PL/EN**, testy integracyjne (Docker Postgres) + E2E (Playwright), Lighthouse CI.

> Decyzja: priorytet (AI vs security vs hardware vs emotki). Hardware (Hue/Govee) + AI wymagają kont/kluczy.

---

## 1. Jakość kodu, testy i CI/CD 🔥

Pierwsza warstwa domknięta: **są już testy jednostkowe (Vitest) i CI (GitHub Actions)** — patrz CHANGELOG. Zostają warstwy wyżej: testy integracyjne (API + DB) i E2E.

| Propozycja | Pri | Notatki |
|---|---|---|
| ~~**Testy jednostkowe** (Vitest)~~ ✅ | — | **Zrobione** — czysta logika bez DB w `lib/economy.ts` + `src/lib/__tests__/`: payout predictions, tier battle passa, konwersja walut, poziomy/rangi, polska pluralizacja, podpisy webhooków + świeżość, nagłówki rate-limitera |
| ~~**Testy integracyjne** API routes~~ ✅ | — | **Zrobione (#159)** — Prisma na **realnym Postgresie** (Docker lokalnie / service container w CI): `tests/integration/` + `vitest.integration.config.ts` + `npm run test:integration`. Pokrywają ścieżki money-critical end-to-end: **predictions** (wager/resolve/refund/cancel/auto-lock), **Koło Fortuny** (spin/koszt/saldo), **pruning** (retencja). Osobny job CI `integration · postgres`. **11 testów** |
| ~~**E2E** (Playwright)~~ ✅ | — | **Zrobione (#163)** — `playwright.config.ts` + `e2e/smoke.spec.ts`: **12 testów** ładujących wszystkie publiczne strony w prawdziwym Chromium (status <400, nav/footer, nagłówek Koła, 404). Job CI `e2e · playwright` (Postgres service → `db push` → `next build` → `next start` → testy). Zweryfikowane lokalnie 12/12. *(Happy-path z logowaniem = opcjonalny kolejny krok — wymaga seedowanego usera/OAuth mocka.)* |
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
| ~~**Sentry** (error tracking)~~ ✅ | — | **Zrobione (#162)** — `@sentry/nextjs` server + edge przez `instrumentation.ts` + `onRequestError` (bez `withSentryConfig` = zero zmian w `next build`). **No-op bez `SENTRY_DSN`** → ustaw env w Vercel, by aktywować. *(Client SDK + source-maps = opcjonalny kolejny krok.)* |
| ~~**Vercel Analytics + Speed Insights**~~ ✅ | — | **Zrobione (#155)** — `@vercel/analytics` + `@vercel/speed-insights` w root layout (real-user Core Web Vitals, cookieless, no-op poza Vercel) |
| ~~**Structured logging**~~ ✅ | — | **Zrobione** — `lib/logger.ts` (JSON+poziomy, `LOG_LEVEL`, +5 testów) wpięty w 3 webhooki (twitch-eventsub / kick-events / paymedia) + crony (`prune` #151, `streamlabs-poll` #160). *(Hot-path `award` świadomie bez logu na wywołanie — byłby szum; błędy łapie boundary.)* |
| **Uptime / health-check** | 🟡 | Endpoint `/api/health` + zewnętrzny monitor (cron-job.org / UptimeRobot) na live + bazę |
| ~~**Alerty na anomalie ekonomii**~~ ✅ | — | **Zrobione (#161)** — `lib/economy-anomaly.ts`: pojedynczy grant ≥100k GT lub ≥500k GT/godz. → powiadomienie wszystkich adminów (link do audit logu) + `log.warn`. Fire-and-forget w `/api/admin/grant-tokens` |

---

## 3. Wydajność (kolejne kroki) 🟡

Dużo już zrobione (cache, indeksy, lazy admin, `staleTimes`, równoległe zapytania — patrz CHANGELOG). Następne:

| Propozycja | Pri | Notatki |
|---|---|---|
| **React Compiler** | ⛔ | Świadomie odroczony — auto-memoizacja. Reguły lintu (`react-hooks` v7) są już w configu po migracji Next 16 (**wyłączone** — flagują nasze wzorce). Wrócić, gdy będzie warto (po testach) |
| **`next/image` po wyjściu z Hobby** | 🟡 | Dziś natywne lazy `<img>` (oszczędność quoty optymalizatora). Po Pro warto przemierzyć na `next/image` (AVIF/WebP, auto-srcset) |
| **Audyt rozmiaru bundla** | 🟡 | ✅ `@next/bundle-analyzer` wpięty (`npm run analyze` → treemapy `.next/analyze`). Zostaje sam code-split `AdminClient.tsx` (~7k linii) — `/admin` to route on-demand (niski priorytet), rozbicie wymaga wyniesienia inline'owego `SectionCard`+typów do współdzielonego modułu |
| **Streaming / Suspense granice** | 🧊 | Progresywny render ciężkich list zamiast pełnego SSR-blokowania |
| **Redis/Upstash dla rate-limit + cache** | 🧊 | Dziś DB-backed (fail-open). Przy skali wynieść do Redisa (mniejszy narzut na Postgres) |
| **Tuning połączeń DB** | 🟡 | `connection_limit`/`pool_timeout` w Vercel env (patrz CHANGELOG — wymaga ręcznej zmiany przez usera) |

---

## 4. Bezpieczeństwo (kolejne kroki) 🟡

Solidna baza (HSTS, CSP, COOP, rate-limit, webhook verify, audit log — patrz CHANGELOG). Co dociągnąć:

| Propozycja | Pri | Notatki |
|---|---|---|
| **CSP — `'unsafe-eval'` usunięte** ✅ / nonce dla `'unsafe-inline'` 🔥 | częściowo | ✅ **(#164)** `'unsafe-eval'` wycięte ze `script-src` (prod React/Next go nie potrzebuje; zweryfikowane E2E ze strażnikiem naruszeń CSP w konsoli). **Zostaje:** usunięcie `'unsafe-inline'` ze `script-src` przez nonce middleware (inline `style=` w overlayach wymusza pozostawienie `style-src 'unsafe-inline'`) — osobna sesja z testami w przeglądarce |
| **2FA / step-up dla akcji admina** | 🟡 | Wrażliwe akcje (grant dużych kwot, merge, ban) za dodatkowym potwierdzeniem |
| ~~**Audyt zależności**~~ ✅ | — | **Zrobione (#156)** — `npm audit --omit=dev --audit-level=high` w CI (nieblokujący) + Dependabot (patrz §1) |
| ~~**Rotacja sekretów + skan**~~ ✅ | — | **Zrobione** — skan: **GitGuardian** (na PR) + **runbook rotacji** w [docs/ENV.md §5](docs/ENV.md) (`BOT_SECRET`/`NEXTAUTH_SECRET`/`ENCRYPTION_KEY`/OAuth/EventSub/tokeny botów/webhooki) |
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
- **Game library** — ✅ **Steam (#165) + PSN (#168)** (`/games` + `/admin#games`, sync biblioteki). **Zostaje:** GOG (licences) / Ubisoft (demux) / Xbox + voting widget „następna gra”

### Pomysły użytkownika (2026-05-30) — do zrealizowania

- ✅ **Customizacja alertów** (T16) — podgląd na żywo + rozmiar/kolor tekstu (#24, #25) **oraz per-typ**: animacja / pozycja / własny dźwięk / próg kwotowy osobno dla każdego typu alertu (`AlertTypeConfig`, `/admin#alerts`). **ZROBIONE w całości.**
- 🔥 **OBS WebSocket — hasło wklejane na stronie** (`/admin`), nie w env → przeżywa zmianę komputera (kopiuj-wklej)
- 🔥🎨 **Strona startowa (landing)** — ładny pierwszy ekran przy wejściu. *(Wymaga Twojego kierunku wizualnego — robię świadomie po Twoim feedbacku, by nie zgadywać gustu i nie generować churnu.)*
- ✅ **Changelog na stronie `/about` jako zwijana lista** — **ZROBIONE** (`ChangelogList` — klik→rozwija, najnowszy wpis otwarty, `aria-expanded`).
- ✅ **Opisy uprawnień w UI nadawania rang** (`/admin#users`) — opis „co daje" + tooltip pod każdym uprawnieniem (`MOD_PERMISSIONS.desc`). **ZROBIONE.**
- ✅ **„Czas na streamie"** — zrobione jako **analityka nadawania** w `/admin#analytics` (`StreamSession` + EventSub `stream.online/offline`). *(Świadomie NIE per-widz: EventSub mierzy tylko czas, gdy streamer jest na żywo — per-widz wymagałby osobnego systemu obecności.)*
- 🟡 **Wybór dostawcy donacji** — nie tylko Streamlabs; wybór platformy w panelu (każdy dostawca = osobna integracja)
- 🟡 **AI Moderator — wybór modelu/dostawcy** (Anthropic / OpenAI / Google), nie tylko jeden — abstrakcja providera + setting
- ✅ **Ankiety / głosowania** na stronie — **ZROBIONE**: `/polls` (głosowanie + wyniki na żywo) + `/admin#polls` (tworzenie/zamykanie/usuwanie). Modele `Poll`/`PollVote`.
- **Integracje:** ✅ **Rumble status (#167)** (overlay `/overlay/rumble` — LIVE/widzowie/followers). 🧊 Trovo, Instagram, Facebook, X (X wymaga płatnego planu API), TikTok
- 🧊 **Redesign / lepszy layout** — czytelność, przejrzystość, mniej męczący dla oka + zmiana grafiki

> ✅ Już zrobione z tej puli: **cały chat bot 3A + rdzeń 3B** (timery / FAQ / powitania / song-requests / chat-overlay), Stream Goals + Hype Train, Predictions, Battle Pass/Sezony (patrz [CHANGELOG.md](CHANGELOG.md) + [PHASE3.md](PHASE3.md)).

### Pomysły użytkownika (2026-06-03) → świeży podział na fazy w [PLAN.md](PLAN.md)

Po modernizacji stacku do najnowszych majorów rozpisana **Faza A** (autonomiczna, bez kluczy) → B (decyzje techniczne) → C (🔑 creds) → D (🎨 redesign) → E (moonshot). Pełen rozpis: [PLAN.md](PLAN.md).

- ✅ 🤖 **Eventy: „Aktywne" + „Edycja" scalone** *(prośba usera)* — jedna karta „Eventy" w `/admin#events` (lista wszystkich eventów + Wylosuj/ON-OFF/Edit w wierszu, liczniki uczestników, reaktywacja dezaktywowanych). **Faza A #1.**
- ✅ 🤖 **EmptyState na Sklepie + Home** — sygnaturowy pusty stan na publicznych widokach (`/shop` + widget eventów na stronie głównej). **Faza A #5 (część publiczna).**
- ✅ 🤖 **a11y — ARIA na popoverach** — dzwonek powiadomień (`role="dialog"`/`aria-expanded`) + menu konta (`aria-haspopup`). **Faza A #5 (a11y).** Zostaje już tylko kontrast czerwień/czerń.
- ✅ 🤖 **„Czas na streamie" + analityka per-stream** — model `StreamSession` + Twitch EventSub `stream.online/offline` → karta w `/admin#analytics` (LIVE+uptime / łączny czas / liczba / lista sesji). `db push` na żywej bazie. **Faza A #2.** *(Akcja usera: „Utwórz subskrypcje" w `/admin#twitch`. EventSub = czas nadawania, nie per-widz.)*
- ✅ 🤖 **Komendy warunkowe** — `requiresLive` + `activeFromMinute` (status live z `StreamSession`; bot bramkuje). **Faza A #3.** *(`minViewers` pominięte — brak trackingu widzów.)*
- ✅ 🤖 **Bundle analyzer** — `@next/bundle-analyzer` + `npm run analyze`. **Faza A #4 (narzędzie).** Sam code-split `AdminClient` zostaje osobnym mierzalnym PR-em.
- ✅ 🤖 **Code-split panelu (start)** — `SectionCard`/typy wyniesione + sekcje Analityka/Audit przez `next/dynamic`. Wzorzec gotowy pod kolejne sekcje. **Faza A #4 cz. 1.**
- 🤖 **Faza A do zrobienia:** dalsze sekcje admina do `next/dynamic` (iteracyjnie) · i18n PL/EN · testy integracyjne+E2E · kontrast a11y.

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
- ✅ 🤖 **Prestiż (Phantom Ascension)** — **ZROBIONE (#173)**: po max poziomie (100) dalsze XP daje gwiazdki prestiżu ✦ (co 50 000 XP ponad cap, **bez resetu** — czysta pochodna lifetime XP), perk **+2% GT z czatu / gwiazdkę** (kumulowany z perkiem poziomu), ✦ na profilu (własnym/publicznym) i w rankingu. `User.prestige` + `prestigeFromXp`/`prestigeGtMultiplier` w `economy.ts` (+5 testów), refaktor `awardAccountXp`.
- ✅ 🤖 **Perk lojalnościowy — zniżka w sklepie** — **ZROBIONE (#174)**: poziom konta + prestiż obniżają ceny w sklepie (−0,15%/lvl + −1%/✦, do −30%). `discountedPrice` naliczany serwerowo w `shop/buy` (źródło prawdy), `ShopClient` woła tę samą czystą funkcję → cena na karcie/modal/affordability zgodna z naliczeniem. `shopDiscountFraction`/`discountedPrice` w `economy.ts` (+4 testy).
- ✅ 🤖 **Mini-gra PvP `!duel`** — **ZROBIONE (#175)**: pojedynki na GT (`!duel 100` otwarte / `!duel @nick 100` / `!accept` / `!decline`), uczciwy coinflip (crypto-RNG), zwycięzca bierze pulę minus 5% rake. Atomowy transfer obu stawek w jednej transakcji (`lib/duels.ts`), model `Duel` (`db push`), portal `/api/bot/duel`, bot `gtDuel.ts` na 3 platformach, prune po 30 dniach. `duelPayout`/`pickDuelWinner` (+6 testów). **⚠️ db push + restart bota.**
- ✅ 🤖 **Osiągnięcia za prestiż / pojedynki / kasyno** — **ZROBIONE (#179)**: +7 achievementów (53→60), nowe triggery `prestige`/`duels_won`/`casino_plays` w `lib/achievements.ts`, przyznawane fire-and-forget po prestiż-upie/wygranej/grze. **Aktywacja na prodzie: `npm run db:seed:achievements`** (bezpieczny skrypt — NIE pełny `db:seed`, który kasuje+odtwarza sklep i eventy).
- ✅ 🤖 **TTS na overlayu alertów** — **ZROBIONE (#180)**: czytanie alertów na głos przez `speechSynthesis` przeglądarki (działa w OBS, za darmo, bez dostawcy). Włączane parametrem `&tts=1` w URL źródła OBS (+ `&ttsTypes`/`&ttsRate`/`&ttsVolume`/`&ttsVoice`). Czysto klientowe (`OverlayClient.tsx`), bez schematu/db push.
- ✅ 🤖 **Mini-gra kooperacyjna `!heist`** — **ZROBIONE (#181)**: napad na GT (`!heist <stawka>`, okno 90 s), zbiorowy rzut — szansa rośnie z ekipą (30%→60%), sukces = każdy 2× / wpadka = strata. Escrow przy dołączeniu + atomowa wypłata (`lib/heist.ts`), modele `Heist`/`HeistEntry` (`db push`), portal `/api/bot/heist`, bot `heist.ts` ×3 platformy ze schedulerem rozliczenia. `heistSuccessChance`/`rollHeist` (+5 testów). Prune 30 dni. **⚠️ db push + restart bota.**
- ✅ 🤖 **Mini-gra `!roulette`** — **ZROBIONE (#182)**: europejska ruletka 0–36 (red/black 2×, liczba 36×, RTP ≈0,973) w frameworku `gt-games` — **bez nowego modelu → bez db push**. Chat `!roulette`/`!roleta` + web `/kasyno` (przyciski 🔴/⚫ + liczba). `spinRoulette`/`rouletteColor`/`normRouletteChoice` (+4 testy). **⚠️ restart bota.**
- ✅ 🤖 **Górny pasek — grupowana nawigacja** — **ZROBIONE (#183)**: desktop = 3 bezpośrednie (HOME/SKLEP/RANKING) + 2 rozwijane grupy (GRY ▾, SPOŁECZNOŚĆ ▾, jak panel admina), hover + focus-within (a11y), czysto CSS. Rozwiązuje brak miejsca przy rosnącej liczbie zakładek; nowe funkcje → do grupy. PROFIL w menu avatara. Mobile bez zmian.

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
| Brak websocketów *(Pro aktywny)* | ✅ **Wszystkie overlaye na SSE** (#189 alerty + #190 reszta) + fallback polling | ✅ zrobione; zostają tylko notyfikacje w aplikacji (push) |
| Cron tylko daily | Streamlabs polling 1×/dzień | Częstszy polling donacji / quest reset |
| Funkcje max 10 s | Ciężkie operacje trzeba dzielić | Większe batch-e, mniej obejść |
| Limit optymalizatora obrazów | Natywne `<img>` zamiast `next/image` | Pełny `next/image` (§3) |

> Pełny rozpis ograniczeń: notatka pamięci „vercel-hobby-constraints”.

---

_Aktualizuj ten plik razem z CHANGELOG za każdym razem, gdy coś z roadmapy ląduje na produkcji albo gdy pojawia się nowy pomysł na usprawnienie._
