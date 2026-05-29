# 🗺️ Ghost Empire — Roadmap & propozycje optymalizacji

Jeden plik na **wszystko, co dalej**: kolejne features, hardening, optymalizacje wydajności/bezpieczeństwa, dług techniczny i pomysły „kiedyś”. Konsolidacja propozycji usprawnień, żebyśmy nic nie zgubili między sesjami.

- Co JUŻ jest → [README.md](README.md) (features) + [CHANGELOG.md](CHANGELOG.md) (per data)
- Phase 2 (zamknięte) → [PHASE2.md](PHASE2.md)
- Plan chat bota i engagement → [PHASE3.md](PHASE3.md)

> **Legenda:** 🔥 wysoki priorytet · 🟡 średni · 🧊 nice-to-have / „kiedyś” · ⛔ świadomie odroczone (z powodem)

---

## 0. Następny duży krok

**Phase 3A — chat bot `ghost-empire-chat`** (Twitch + Kick + YouTube) — bot czatu, custom commands, dashboard w `/admin#chat`. Wymaga długo-żyjącego procesu (hosting NIE-Vercel: Railway / VPS). Pełna specyfikacja w [PHASE3.md](PHASE3.md#phase-3a--bot-foundation-3-6-sesji).

> Przed startem 3A potrzebne: bot accounts (Twitch/Kick/YT), decyzja hostingu, wybór 2-3 priorytetowych features z 3B.

---

## 1. Jakość kodu, testy i CI/CD 🔥

Największa luka „top of the top”: **projekt nie ma jeszcze testów ani CI**. Build (`tsc` + `next build`) to jedyna brama jakości.

| Propozycja | Pri | Notatki |
|---|---|---|
| **Testy jednostkowe** (Vitest) | 🔥 | Najpierw czysta logika bez DB: payout predictions, mnożniki tokenów, tier battle passa, podpisy webhooków, rate-limiter |
| **Testy integracyjne** API routes | 🟡 | Prisma na testowej bazie (Supabase branch lub Docker Postgres), kluczowe: ekonomia + webhooki |
| **E2E** (Playwright) | 🟡 | Happy path: login → zarobek → zakup w sklepie; smoke testy publicznych stron |
| **GitHub Actions CI** | 🔥 | Na każdy PR: `tsc --noEmit` + `npm run lint` + `next build`. Blokada merge gdy czerwone |
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

- **3B:** Song Requests, Chat overlay (OBS), Timer/Scheduled messages, FAQ auto-responses (regex), Welcome system, dynamiczne daily questy generowane z aktywności czatu
- **3C:** customizacja alertów per-typ (animacja/font/grafika/dźwięk/threshold), **OBS WebSocket** (sceny/źródła), **Philips Hue / Govee / Lumia** (efekty świetlne na donejty)
- **3D:** **AI Moderator**, AI auto-responses kontekstowe, AI shoutouts/clip-detection, **Subathon/Goalathon**, analityka per-stream + heatmapy czatu, A/B testy komend
- **Game library** (Steam/Roblox + opcjonalnie Xbox/Battle.net) + voting widget „następna gra”

> ✅ Już zrobione z tej puli: Stream Goals + Hype Train, Predictions, Battle Pass/Sezony (patrz PHASE3.md).

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
