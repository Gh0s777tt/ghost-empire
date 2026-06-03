# 🧭 PLAN.md — analiza projektu + plan ukończenia

Świeża, szczegółowa analiza stanu projektu **Ghost Empire** i wykonawczy plan dokończenia — z **kolejnością wykonania zaczynającą od rzeczy autonomicznych** (które wdrażam sam, bez Twojej uwagi). Aktualizowany na bieżąco.

> Skróty: 🤖 = robię sam · 🔑 = wymaga Twoich kluczy/kont · 🎨 = wymaga Twojego kierunku (gust).
> Reszta dokumentów: [README](README.md) · [CHANGELOG](CHANGELOG.md) · [ROADMAP](ROADMAP.md) · [ARCHITEKTURA](docs/ARCHITECTURE.md) · [ENDPOINTY](docs/ENDPOINTS.md) · [ENV](docs/ENV.md) · [PERMISSIONS](PERMISSIONS.md).

---

## 1. Analiza — co JUŻ działa ✅

**Ekonomia & tożsamość**
- Logowanie Twitch / Discord / Google→YouTube / Kick (NextAuth, łączenie kont, jedno konto = wiele platform).
- Ghost Tokens: zarobek z czatu/voice/subów/donacji/questów, wydatki w sklepie/predykcjach/raffle, log transakcji.
- Role: admin / moderator (z granularnymi `modPermissions`) / donator. Stały admin po e-mailu (przeżywa reset bazy).

**Platformy & live**
- Chat bot Twitch + Kick + YouTube (komendy z portalu, timery, FAQ, powitania, song requesty).
- Webhooki Twitch EventSub + Kick (suby/gifty/bity), polling YouTube (super chaty/membery), donacje Streamlabs.

**Engagement**
- Sklep (grafiki + warunki odblokowania, w tym przez osiągnięcie), Eventy (giveaway/raffle/contest/happy hour + szablony okolicznościowe), Predictions, Battle Pass/Sezony (nagrody tokenowe i rzeczowe item/kod), Osiągnięcia (własne, tworzone w panelu, + nagrody rzeczowe), Daily questy, Streak, Drop-code'y, **Drop losowych kodów**, **Ankiety**.

**Overlaye OBS** (token-gated, polling): alerty, Stream Goals + Hype Train, czat, Subathon, rotacja kodów — wszystkie z **podglądem w panelu**.

**Panel admina** (`/admin`): ~24 sekcje, leniwe ładowanie per sekcja, audit log (czytelny: nick → akcja → obiekt), reset bazy z potwierdzeniem.

**Infra/jakość**: Next 15 + Prisma + Supabase + Vercel, CI (typecheck+lint+test), testy jednostkowe czystej logiki, branding GHOST77 (ikony/OG/avatary/ekrany), dokumentacja techniczna (`docs/`).

---

## 2. Co zostało — pogrupowane wg tego, kto musi działać

### 🤖 A. Autonomiczne (robię sam — kolejność = priorytet)
1. ✅ **Chat overlay — customizacja wiadomości** — **ZROBIONE**: rozmiar / kolor / czcionka / krycie tła / ikona platformy na `/overlay/chat`, sterowane z `/admin#chat`, z podglądem na żywo. Model `ChatOverlayConfig` + sparametryzowany `ChatMessageRow`.
2. ✅ **Stream Alerts — własne (customowe) alerty** — **ZROBIONE**: admin tworzy własny alert (nazwa / tytuł / treść / ikona / kolor / liczba) w `/admin#alerts` i ręcznie wyzwala go na overlayu, z podglądem na żywo. Model `CustomAlert` + `fire` wpięte w kolejkę (per-alert accent).
3. **Profil — poprawne nicki platform** *(bug)* — Kick pokazuje local-part e-maila, YouTube nic. Plan: nick Kicka odświeżany z handle przy logowaniu Kickiem; **handle YouTube** dociągany przez YouTube Data API (token streamera już mamy). Naprawia „połączone konta" + „social linki".
4. ✅ **Hardening/polish** — ✅ `/api/health` (200/503) + ✅ testy `displayNick` (41 testów) + ✅ a11y (`:focus-visible`, skip-link, `prefers-reduced-motion`). *(Prettier świadomie odłożony — pełny reformat repo = ogromny, ryzykowny diff bez realnej wartości.)*

#### 🤖 Faza A (2026-06-03) — kolejna seria autonomiczna (kolejność = priorytet)
Po modernizacji stacku do najnowszych majorów (Next 16 · React 19 · TS 6 · Prisma 7 · Tailwind 4 · zod 4 · vitest 4 · ESLint 9). Każde = osobny PR (branch → tsc/lint/test → squash-merge).
1. ✅ **Eventy: scalenie „Aktywne" + „Edycja"** *(prośba usera)* — **ZROBIONE**: jedna karta „Eventy" (`EventsManager`) z pełną listą (aktywne na górze, nieaktywne wyszarzone) + akcje w wierszu (Wylosuj / ON-OFF / Edit), liczniki uczestników, możliwość reaktywacji. `requireAnyPermission` dla section-data.
2. ✅ **„Czas na streamie" + analityka per-stream** — **ZROBIONE** (greenlight usera): model `StreamSession`, webhook `stream.online`/`stream.offline` (idempotencja + safety-net), karta w `/admin#analytics` (LIVE+uptime / łączny czas / liczba / lista sesji), `stream.online/offline` w `EVENT_TYPES_TO_SUBSCRIBE`. `db push` wykonany na żywej bazie. **Akcja usera:** kliknąć „Utwórz subskrypcje" w `/admin#twitch`, żeby zarejestrować nowe eventy. *(EventSub = czas nadawania, nie per-widz.)*
3. ✅ **Komendy warunkowe** — **ZROBIONE**: `requiresLive` + `activeFromMinute` w `ChatCommand` (status live z `StreamSession`/#2 przez `/api/bot/chat-commands`; bot bramkuje `matchCommand`). Edytor + plakietki LIVE/≥Xmin w `/admin#chat`. `db push` na żywej bazie. *(`minViewers` pominięte — brak trackingu widzów. Akcje usera: restart bota + „Utwórz subskrypcje" w `/admin#twitch`.)*
4. **Code-split `AdminClient.tsx`** — monolit ~7k linii → lazy per-sekcja + `@next/bundle-analyzer`.
5. 🟡 **Dokończenie empty/error states + a11y** — ✅ publiczne listy (`EmptyState` na Sklepie + widgecie Home) + ✅ ARIA na popoverach (dzwonek powiadomień `role="dialog"`/`aria-expanded`/`aria-controls`, menu konta `aria-haspopup`). Zostaje już tylko: **kontrast czerwień/czerń** (ryzykowne — kolory marki, osobno). *(Pozostałe surowe „Brak…" to sekcje admina + drobne pod-karty — świadomie inline.)*
6. **i18n PL/EN — fundament** — `textEn` już w seedzie; warstwa tłumaczeń stron publicznych.
7. **Testy integracyjne (API+DB, Docker Postgres) + E2E Playwright** — webhooki/ekonomia + happy-path.
8. 🟡 **Structured logging** — ✅ `lib/logger.ts` (JSON+poziomy, `LOG_LEVEL`, +5 testów) wpięty we **wszystkie 3 webhooki** (`twitch-eventsub` / `kick-events` / `paymedia`, 18× `console.*` → `log.*`). Zostaje cron / award (ten sam wzorzec).

### 🔑 B. Wymaga Twoich kluczy/kont (dokładne nazwy w [docs/ENV.md](docs/ENV.md))
1. **Logowanie/łączenie Twitch — BLOKER** — „klikam i nic": sprawdź w **Vercel** `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` (+ redeploy) oraz Redirect URI w dev.twitch.tv = `https://<domena>/api/auth/callback/twitch`. Kod jest OK; ekran logowania pokazuje teraz konkretny błąd.
2. **Interaktywne social linki (OAuth „połącz jednym kliknięciem")** *(nowe)* — Instagram / TikTok / X / Facebook. Każda platforma wymaga **zarejestrowanej aplikacji deweloperskiej** (client id/secret + redirect URI), a IG/TikTok także **przeglądu aplikacji**. Twitch/Kick/Google(YouTube) OAuth już są — te mogę podpiąć od razu po odblokowaniu Twitcha. Przygotuję UI „Połącz" gotowe pod creds.
3. **AI Moderator** — klucz API (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_AI_API_KEY`).
4. **OBS WebSocket / Philips Hue / Govee** — hasło/konta deweloperskie.

### 🎨 C. Wymaga Twojego kierunku (gust)
1. **„Repo jak arcydzieło" / redesign** — chcę uniknąć ryzykownego globalnego refactora layoutu (sidebar odrzucony). Robię to **iteracyjnie i bezpiecznie**: spójność kolorów/odstępów, dopieszczone komponenty, mikro-animacje, wykorzystanie dostarczonych grafik (baner/hero). Daj kierunek: co najbardziej „kłuje" (gęstość? kolory? konkretna strona?).

---

## 3. Kolejność wykonania

1. ✅ Bugfixy: audit log (nick), przycisk wyloguj w profilu — **zrobione**.
2. ✅ 🤖 **A1 — chat overlay: customizacja wiadomości** — zrobione
3. ✅ 🤖 **A2 — Stream Alerts: własne alerty** — zrobione
4. ✅ 🤖 **A3 — poprawne nicki Kick/YouTube** — Kick: fix pola (`name` zamiast `username`); YouTube: scope `youtube.readonly` + dociąganie `@handle`/nazwy kanału z Data API; Google nie wystawia już imienia+nazwiska. Działa po przelogowaniu. *(Twoja akcja: w Google Cloud Console dla apki głównej `129216…` włącz „YouTube Data API v3" + dodaj scope `youtube.readonly` na OAuth consent screen.)*
5. ✅ 🤖 **A4 — hardening/polish** — health + testy + a11y zrobione (Prettier świadomie odłożony)
6. ✅ 🔑 **B1 — odblokowanie OAuth** — env Twitch/Kick/Google w Vercel zaktualizowane + redeploy; logowanie Twitch/Kick/YouTube/Google **działa** (zweryfikowane: `/api/health`, `/api/auth/providers`, Google redirect_uri OK).
7. 🔑 **B2 — social OAuth IG/TikTok/X/FB** (Ty: aplikacje deweloperskie) → ja podpinam
8. 🔑 **B3/B4 — AI / OBS WS / Hue / Govee** (Ty: klucze) → ja podpinam
9. 🎨 **C — redesign iteracyjny** (Twój kierunek)

---

## 4. Zasady pracy
- **Dokumentacja na bieżąco**: każda zmiana → CHANGELOG + (gdy trzeba) README/ROADMAP/PHASE/PLAN + on-site changelog (`/about`), w tym samym PR.
- Per-feature flow: branch → kod → `tsc`+`lint`(+`test`, `db push` przy schemacie) → PR → squash-merge.
- Sekrety tylko po Twojej stronie (Vercel env / `.env`), nigdy w repo/czacie.
