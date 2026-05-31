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
| **Dependabot / Renovate** | 🟡 | Auto-PR-y na aktualizacje zależności + alerty bezpieczeństwa |
| **Prettier + import sort** | 🧊 | Spójny styl; dziś tylko ESLint |
| **`@typescript-eslint` (next/typescript)** | 🧊 | Włączyć surowsze reguły TS w ESLint (dziś tylko `core-web-vitals`) — najpierw przejrzeć szum |

---

## 2. Monitoring i observability 🔥

Dziś diagnostyka = logi Vercela. Pod produkcję z realnym ruchem to za mało.

| Propozycja | Pri | Notatki |
|---|---|---|
| **Sentry** (error tracking) | 🔥 | Client + server + edge; już mamy `error.digest` w boundary do korelacji |
| **Vercel Analytics + Speed Insights** | 🟡 | Realne Core Web Vitals z produkcji, mały koszt integracji |
| **Structured logging** | 🟡 | Webhooki/cron/award logują dziś `console.*`; ustrukturyzować (JSON + poziomy) pod alerty |
| **Uptime / health-check** | 🟡 | Endpoint `/api/health` + zewnętrzny monitor (cron-job.org / UptimeRobot) na live + bazę |
| **Alerty na anomalie ekonomii** | 🧊 | Nietypowe skoki grantów/odbić → notyfikacja admina (anti-abuse) |

---

## 3. Wydajność (kolejne kroki) 🟡

Dużo już zrobione (cache, indeksy, lazy admin, `staleTimes`, równoległe zapytania — patrz CHANGELOG). Następne:

| Propozycja | Pri | Notatki |
|---|---|---|
| **React Compiler** | ⛔ | Świadomie odroczony — auto-memoizacja React 19; na 18.3 to eksperyment, ryzyko niewidoczne w buildzie. Wrócić po pokryciu testami |
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
| **Rotacja sekretów + skan** | 🟡 | Proces rotacji `BOT_SECRET`/OAuth + secret-scanning w repo (gitleaks) |
| **Rate-limit per-IP na publicznych stronach** | 🧊 | Dziś per-user na ekonomii; dorzucić warstwę edge/IP na publicznych GET-ach |

---

## 5. Dostępność (a11y) i UX 🟡

| Propozycja | Pri | Notatki |
|---|---|---|
| **Audyt a11y** (axe / Lighthouse) | 🟡 | Kontrast (czerwień na czerni), focus states, nawigacja klawiaturą, ARIA na modalach/dropdownach |
| **Skip-to-content + landmarki** | 🟡 | Szybka wygrana dla czytników ekranu |
| **i18n (PL/EN)** | 🧊 | W seedzie jest już `textEn` dla questów — fundament pod angielską wersję dla widzów zza granicy |
| **Empty/error states** | 🧊 | Spójne, brandowane stany pustych list i błędów ładowania sekcji |
| **OG images — dopieszczenie** | 🧊 | Wzbogacić share-preview (np. dynamiczne tła per ranga/tier) |

---

## 6. Backlog produktowy (engagement) — z Phase 3B/3C/3D 🟡

Pełne specyfikacje w [PHASE3.md](PHASE3.md). Skrót tego, co jeszcze NIE zrobione:

- **3B:** ✅ **zrobione w całości** (Song Requests, Chat overlay, Timery, FAQ, Welcome) + ~~dynamiczne daily questy z czatu~~ #19, ~~tytuły song requestów (oEmbed)~~ #18, ~~bonus tokenów przy powitaniu~~ #16
- **3C:** customizacja alertów per-typ (animacja/font/grafika/dźwięk/threshold), **OBS WebSocket** (sceny/źródła), **Philips Hue / Govee / Lumia** (efekty świetlne na donejty)
- **3D:** **AI Moderator**, AI auto-responses kontekstowe, AI shoutouts/clip-detection, ~~Subathon/Goalathon~~ ✅ (#17), analityka per-stream + heatmapy czatu, A/B testy komend
- **Game library** (Steam/Roblox + opcjonalnie Xbox/Battle.net) + voting widget „następna gra”

### Pomysły użytkownika (2026-05-30) — do zrealizowania

- **Customizacja alertów** (T16) — ✅ podgląd na żywo w panelu + **rozmiar alertu / rozmiar tekstu / kolor tekstu** (suwaki + picker, na overlayu i w podglądzie) + URL do OBS (#24, #25). Zostaje 🟡: **per-typ** osobno (animacja / pozycja / dźwięk / threshold kwotowy dla każdego typu alertu)
- 🔥 **OBS WebSocket — hasło wklejane na stronie** (`/admin`), nie w env → przeżywa zmianę komputera (kopiuj-wklej)
- 🔥 **Strona startowa (landing)** — ładny pierwszy ekran przy wejściu (wariacja na temat `/about`)
- 🟡 **Changelog na stronie `/about` jako zwijana lista** — mniej miejsca, rozwijane po szczegóły
- 🟡 **Opisy uprawnień w UI nadawania rang** (`/admin#users`) — patrz [PERMISSIONS.md](PERMISSIONS.md)
- 🟡 **Profil: „czas spędzony na streamie"** — wymaga trackingu sesji streamu (Twitch `stream.online/offline`)
- 🟡 **Wybór dostawcy donacji** — nie tylko Streamlabs; wybór platformy w panelu (każdy dostawca = osobna integracja)
- 🟡 **AI Moderator — wybór modelu/dostawcy** (Anthropic / OpenAI / Google), nie tylko jeden — abstrakcja providera + setting
- 🟡 **Ankiety / głosowania** na stronie
- 🧊 **Integracje:** Rumble, Trovo, Instagram, Facebook, X, TikTok
- 🧊 **Redesign / lepszy layout** — czytelność, przejrzystość, mniej męczący dla oka + zmiana grafiki

> ✅ Już zrobione z tej puli: **cały chat bot 3A + rdzeń 3B** (timery / FAQ / powitania / song-requests / chat-overlay), Stream Goals + Hype Train, Predictions, Battle Pass/Sezony (patrz [CHANGELOG.md](CHANGELOG.md) + [PHASE3.md](PHASE3.md)).

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
