# 🧭 PLAN.md — analiza projektu + plan ukończenia

Świeża, szczegółowa analiza stanu projektu **Ghost Empire** i wykonawczy plan dokończenia — z **kolejnością wykonania zaczynającą od rzeczy autonomicznych** (które wdrażam sam, bez Twojej uwagi). Aktualizowany na bieżąco.

> Skróty: 🤖 = robię sam · 🔑 = wymaga Twoich kluczy/kont · 🎨 = wymaga Twojego kierunku (gust).
> Reszta dokumentów: [README](README.md) · [CHANGELOG](CHANGELOG.md) · [ROADMAP](ROADMAP.md) · [ARCHITEKTURA](docs/ARCHITECTURE.md) · [ENDPOINTY](docs/ENDPOINTS.md) · [ENV](docs/ENV.md) · [PERMISSIONS](PERMISSIONS.md).

---

## 0. 🆕 Wishlist 2026-06-04 — „Studio" (customizacja · widgety · AI · moderacja · bezpieczeństwo)

Duży zrzut pomysłów od usera + moje propozycje. Pogrupowane wg autonomii; kolejność = rekomendowany priorytet. Każda pozycja = osobny PR (branch → tsc/lint/test → squash-merge).

> ### ✅ STATUS (2026-06-04, po 36 PR-ach #109–#144)
> **F1 ✅ · F2 ✅ · F3 ✅ · F5 ✅ · F6 🟡 częściowo · F4 🔑 czeka na klucz API.** Doszła też **„G-faza" UX** (prośby usera): grupowana nawigacja, panel integracji (klucze API na stronie), command palette `Ctrl+K`, checklista statusu, podgląd+edycja per-widget.
> - **F1 ✅** — Subathon kolor/napis (#119) · predykcje+ankiety: kolor·podgląd·overlay (#120–#123) · auto-pin zakładów na czacie (#131) · kalendarz planu (#117).
> - **F2 ✅** — rdzeń detektorów (#118) + panel `/admin#moderation` (#119… właśc. moderation panel) + **egzekucja w bocie** Twitch/Kick/YouTube (#130).
> - **F3 ✅** — biblioteka widgetów (#125) + 6 widgetów (#126–#128, #132) + generator (#129).
> - **F5 ✅** — czcionki (#133) · emoji-picker (#134) · emotki+odznaki w czacie (#135) · gradienty (#136).
> - **F6 ✅ (rozszerzone)** — backup JSON (#137) + sanityzacja URL/XSS (#138) + ✅ **szyfrowanie sekretów at-rest AES-256-GCM** (klucze API #146, tokeny OAuth #147) + ✅ **nagłówki overlay `noindex`/`no-store`** (#148) + ✅ **cron czyszczący bazę** (#151). **Zostało:** auto-backup `pg_dump` na osobny serwer (decyzja: dokąd), AV uploadów (jeśli pliki).
> - **F4 🔑** — gotowy panel integracji (`/admin#integrations`) na klucz AI → po wklejeniu buduję postać `@bot` + `!imagine`.
>
> ### ✅ STATUS (2026-06-05, po 8 PR-ach #146–#153 — „zrób 1/2/3 + moje pomysły")
> - 🔐 **#1 Bezpieczeństwo** — szyfrowanie kluczy API (#146) + tokenów OAuth/streamer (#147) + nagłówki overlay (#148).
> - 💬 **#2 Czat** — prawdziwe odznaki Twitch + emotki 7TV/BTTV/FFZ (#149).
> - 🎰 **#3 Nowy moduł** — **Koło Fortuny** (`/wheel` + overlay OBS + panel admina) (#150).
> - ➕ **Moje pomysły:** cron czyszczący bazę (#151) · predictions auto-close + announce-to-chat (#152) · eskalacja moderacji recydywistów + statystyki naruszeń (#153, ⚠️ aktywne po restarcie bota).
> - **Świadomie odroczone (z powodem):** E2E Playwright / Lighthouse CI (wymagają `next build` + serwera — niedostępne lokalnie) · Prettier (ogromny diff formatu vs. ustalony styl ESLint) · widgety zapis pozycji/rozmiaru (OBS sam pozycjonuje Browser Source) · AI-moderacja (czeka na klucz API).
>
> ### ✅ STATUS (2026-06-05 cd., po PR #155–#160 — „zrób wszystko co możesz sam")
> - 📊 **Obserwowalność** — Vercel Analytics + Speed Insights (#155) · `npm audit` w CI (#156) · structured logging dokończony (crony #151/#160).
> - 🔗 **Webhooki wychodzące** (Discord/n8n/custom, sekret HMAC, auto-disable) (#157).
> - 🧪 **Testy integracyjne API+realny Postgres** — `tests/integration/` + job CI `integration · postgres` (predictions/wheel/pruning end-to-end). **111 unit + 11 integration** (#159).
> - 📄 **Docs:** runbook rotacji sekretów (`docs/ENV.md §5`) + sync wszystkich plików (#158) + **kodyfikacja zasady „docs zawsze z changelogiem"** w README/ARCHITECTURE (#160).
> - **Zostało (🔑 Ty / 🎨 kierunek / ⚠️ ryzyko bez builda):** Sentry (DSN + ryzyko build bez weryfikacji `next build`) · CSP nonces (osobna ostrożna sesja) · landing (Twój gust) · AI/`@bot`/`!imagine` (klucz) · OBS WS/Hue/Govee (creds) · social OAuth · i18n · wybór dostawcy donacji · E2E/Lighthouse · code-split AdminClient (nieweryfikowalne bez builda).
>
> ### ✅ STATUS (2026-06-05 cd., sesja „zrób wszystko co możesz sam" — od PR #173)
> *(`next build` działa już lokalnie → weryfikuję zmiany build-affecting; code-split AdminClient wraca do gry.)*
> - ✦ **Prestiż (Phantom Ascension)** (#173) — po max levelu (100) dalsze XP daje gwiazdki prestiżu ✦ (co 50 000 XP ponad cap, **bez resetu** — pochodna lifetime XP), perk **+2% GT z czatu / gwiazdkę** (kumulowany z perkiem poziomu), ✦ na profilu (własnym/publicznym) i w rankingu. `User.prestige` + `prestigeFromXp`/`prestigeGtMultiplier` (+5 testów = 125). ✅ `tsc`/`next build`/testy.

**✅ Najpierw naprawione bugi prywatności (PR #115):** imię/nazwisko zamaskowane (`displayNick`) w rankingu/eventach/home/OG-image; mail (`@…dam`) wyrugowany z „Połączone konta" (`isPublicHandle` + źródło w `auth.ts`); audit log z czytelnymi etykietami (anulowanie predykcji **ma** być w audycie). *(Dane „at-rest" w bazie nietknięte — wszystkie ścieżki renderu maskują; opcjonalny scrub bazy do zrobienia na życzenie.)*

### 🤖 F1 — Customizacja & overlaye (autonomiczne, najpierw)
1. **Subathon: edytowalny kolor + napis na timerze** — pola `accentColor` + `label` w modelu `Subathon`, edytowalne w `/admin#subathon`, aplikowane na overlayu `/overlay/subathon` (+ podgląd). *(Mały, samodzielny — dobry pierwszy.)*
2. **Predictions / zakłady / drop kodów / ankiety: podgląd + kolor + „na czat / na OBS" + auto-pin** — (a) każdemu z tych modułów dodać **podgląd** + **wybór koloru akcentu**; (b) przełącznik **gdzie ogłosić**: wiadomość na czacie (bot) i/lub overlay OBS; (c) **auto-pin**: każdy nowy zakład/predykcja bot **przypina na czacie** (Twitch/Kick — `/pin` lub powtarzanie) i odpina po rozstrzygnięciu, żeby nie zniknął.
3. **Plan streamów jako kalendarz** — widok miesięczny (siatka 7×N) zamiast listy w `/schedule` + `/admin#schedule`; klik w dzień → sloty. Dane już są (`ScheduleSlot`).
4. **Style picker: HEX / gradient / fonty / Unicode-emoji** — jeden współdzielony komponent (kolor solid+gradient, paleta **Google Fonts self-host**, emoji-picker) reużywany w alertach/overlayach/widgetach. UTF-8/emoji w treści **już działa** (Postgres `text`); brakuje UI palety i fontów.

### 🤖 F2 — Zaawansowana moderacja czatu (autonomiczne, logika bota)
Najbardziej zaawansowany system, jaki się da bez zewnętrznych usług. Panel `/admin#moderation`, model `ModRule`, egzekucja w bocie (Twitch/Kick/YouTube):
- **Filtr przekleństw** (słownik PL+EN + warianty/leetspeak), **nadmiar CAPS** (% wielkich liter > próg), **limit długości**, **powtarzający się tekst** (flood/duplikaty/spam emotek), **tekst zalgo** (nadmiar znaków łączących Unicode).
- Per-reguła: próg + akcja (usuń / timeout Ns / ostrzeż / oznacz) + **whitelist** (mod/sub/vip), licznik wykroczeń, log do audytu.

### 🤖 F3 — Biblioteka widgetów + generator (core autonomiczny)
- **Biblioteka**: jedno miejsce ze wszystkimi widgetami (URL do OBS + podgląd): istniejące (alerty/goals/subathon/chat/kody) **+ nowe**: **viewer count · last sub · last follower · last donator · emoji combo**.
- **Zaawansowany generator**: wybór typu danych + layout + styl (kolor/gradient/font/animacja z F1) → gotowy token-URL. Pozwala tworzyć własne widgety bez kodu.
- Dane: last sub/donator **już mamy** (EventSub/Streamlabs); **viewer count** + **last follower** wymagają Twitch Helix (`channel.follow` v2 / get-streams) — token streamera mamy, więc głównie autonomiczne.

### 🔑 F4 — Moduły AI (wymaga Twoich kluczy API + budżetu)
- **Postać AI** (`@bot …`): osobowości (Harry Potter / Vader / Catgirl / Trump / Tate / GigaChad / Musk / **własna**) jako system-prompty; **wybór modelu** (Grok / GPT / Gemini / DeepSeek / Anthropic / Bielik) przez wspólny adapter; konfiguracja **limitów** (pytań/odpowiedzi per user/sesja, cooldown, dzienny budżet-guard). Framework + panel zbuduję sam; **potrzebne: klucze API providerów**, których chcesz użyć.
- **Obrazy AI** (`!imagine <prompt>`): provider obrazów (OpenAI Images / SDXL / Flux…) + moderacja promptu + kolejka na overlay. **Potrzebne: klucz + budżet.**

### 🔑🎨 F5 — Emotki czatu + odznaki + rich-text editor
- **Emotki + odznaki** w chat overlay/feedzie: Twitch (IRC tags — mamy w bocie) + **7TV / BTTV / FFZ** (publiczne API, część autonomiczna) + odznaki sub/mod/vip/bits.
- **Zaawansowany edytor tekstu** (kolor/gradient/font/emoji/markdown) do alertów/widgetów/opisów. Lekki edytor autonomiczny; **kierunek wizualny = Twój**.

### 🔒 F6 — Bezpieczeństwo & backup (część autonomiczna, część = decyzje/infra)
Moje propozycje (otwarte na Twoje):
- **Uploady (alerty/grafika)**: walidacja **magic-bytes** (nie tylko MIME) + limit rozmiaru, **sanityzacja SVG** (usuń `<script>`/`on*`), **re-enkodowanie** obrazów (`sharp`) by zabić payloady, hosting user-assetów na **osobnym buckecie/domenie** (Supabase Storage / Cloudflare R2) z `Content-Disposition: attachment`, **CSP** na overlayach. Opcjonalny skan AV (ClamAV / VirusTotal API — creds).
- **Kradzież danych**: **szyfrowanie tokenów OAuth at-rest** w DB, least-privilege scope'y, brak sekretów w kliencie, security headers (CSP/HSTS/X-Frame), rate-limit + audyt (mamy), `npm audit`/Dependabot (mamy).
- **Backup**: cron **`pg_dump` → osobny, szyfrowany bucket** (Backblaze B2 / R2, retencja N dni) — Supabase PITR jest tylko na płatnym; + **eksport konfiguracji** (sklep/eventy/alerty/komendy) do JSON. **Decyzje: gdzie trzymać backup + budżet.**

**Rekomendowana kolejność:** F1 → F2 → F3 (autonomiczne, od ręki) → potem F4/F5/F6 gdy dasz klucze/decyzje. Szczegóły każdej pozycji rozpisuję przy starcie danego PR.

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
4. 🟡 **Code-split `AdminClient.tsx`** — ✅ `@next/bundle-analyzer` (`npm run analyze`) + ✅ **start splitu**: `SectionCard`→`admin/shared.tsx`, `AuditEntry`→`admin/types.ts`, sekcje **Analityka** + **Audit log** + **Ankiety** + **Osiągnięcia** wycięte do `admin/sections/` i `next/dynamic` (`ssr:false`); `FieldInput`/`FieldTextarea` też w `admin/shared.tsx`. **Zostaje:** przenosić kolejne (cięższe) sekcje tym samym wzorcem (Shop/Seasons/StreamAlerts/Predictions/Goals/Users/chat-suite…) — iteracyjnie, niski priorytet (`/admin` = route on-demand). *(Uwaga: `dynamic()` wymaga inline `{ssr:false}` — nie współdzielonego obiektu opcji.)*
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
