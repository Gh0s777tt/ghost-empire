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

> **🆕 Świeżo dowiezione (2026-06-10/11, PR #381–#430):** 🎰 **kasyno = 10 gier** (dice/crash/plinko/mines/blackjack/hi-lo/zdrapki + 3D kości, jackpot progresywny, happy hours, daily bonus, nagrody tygodnia) · 🧭 **admin: tryby Prosty/Zaawansowany/Dev + opisy 32 sekcji + asystent AI** · 🧪 **E2E Playwright AKTYWNE** (23 testy przeciw prod + dzienny CI; GH Actions czeka na odblokowanie billingu konta GitHub) · 🏢 **SaaS multi-tenant white-label KOMPLET KODU (#416–#430)**: tokeny platform per-tenant + OAuth-state HMAC, webhook→tenant, tenant-aware admin, 5 markerów brandingu w i18n+loader, `--brand` CSS-vars, logo/metadata/manifest per tenant, plany basic⊂pro⊂elite z bramkami na wszystkich trasach, panel **Portale** (admin-of-admins), kreator **`/onboarding`** (trial 14 dni) + dashboard **„Mój portal"**, **Stripe dry-wired** (Checkout+webhook śpią na 503 — checklist „dzień Stripe" w README).

> **🆕 Świeżo dowiezione (2026-06-11, PR #431–#436):** 🏢 **SaaS domknięty również w warstwie streamingu i wizualnej**: 📡 **overlaye OBS multi-tenant** (#432 — 12 feedów przewleczonych tenantem, token OBS per portal, 6 modeli) · 🤖 **bot czatu multi-tenant** (#433 — flota „proces per portal" przez `ENV_FILE`, szablon + README) · 🖼️ **branding pass 5d** (#435 — social preview OG per tenant z dynamicznym `/api/og`, hero home/welcome/signin z marki tenanta, 24 glow-tła na `var(--brand)`) · 🔒 **idempotencja webhooka PayMedia** (#434 — `Transaction.externalId @unique`, koniec ryzyka podwójnego kredytowania) · 📄 docs-sync README/ROADMAP #431 + cache `/api/og` i testy e2e OG #436.

> **🆕 Świeżo dowiezione (2026-06-19, PR #477–#488):** ⚔️ **wojny klanów — komplet** (#477 rdzeń: start/koniec/punkty/pula + #480 Hall of Fame + #481 powiadomienia zwycięzców + #482 overlay OBS live) · 📲 **PWA** instalowalna + bricking-proof service worker (#478) · ✨ **View Transitions** crossfade nawigacji (#479, przez `document.startViewTransition` — React `unstable_ViewTransition` niedostępny w 19.2) · 🎁 **daily-bonus odbierany z każdej strony** (#483, wskaźnik w nagłówku) · 🎯 **questy zaangażowania** klan/companion/koło/ankieta (#485, zaseedowane `db:seed:tasks`) · 🛡️ **karta klanu z trofeami wojen na profilu** + OG profilu z prestiżem/tagiem (#484/#488) · 🔒 **rate-limit per-IP na publicznych GET-ach** (#486 → §4) · ♿ **`prefers-contrast: more`** (#487 → §5).

> **🆕 Świeżo dowiezione (2026-06-19, PR #490–#505):** 🔐 **2FA / step-up admina (TOTP)** (#490/#491/#496 — enrollment + QR, egzekucja na grantach ≥10k/banach/merge'ach; **domyka §4**) · 🔊 **GT → dźwięki na streamie** (#505 — widz kupuje dźwięk za GT, gra na overlayu OBS) · 🎁 **referrals** (#501 — zaproś znajomego, oboje GT) · 📋 **Klip tygodnia** (#502 — głosowanie na klip Twitcha) · 🔴 **prawdziwy banner „LIVE teraz"** (#500 — koniec statycznej zaślepki) · 🧭 **„Pierwsze kroki"** na home (#503) · 🎨 **Stream Goals + Hype Train: pełne kolory/czcionki + podgląd** (#498/#499) · 🌗 **tryb jasny (beta, opt-in)** (#504) · 🎰 opis kasyna per-gra (#497) · 📜 zwijana historia transakcji (#495) · 🚀 CTA „załóż portal" w menu avatara + /about (#494) · 🩺 **`npm run stripe:check`** preflight (#493).

> **🆕 Świeżo dowiezione (2026-06-19, PR #507–#512):** 🆔 **per-tenant identity — osobny User i saldo PER portal** (#510/#511 — odwrócone globalne unique na `Account`/`User.email`, tenant-aware adapter NextAuth; **wdrożone na prod, logowanie zweryfikowane**; runbook [docs/PER-TENANT-IDENTITY.md] #509) · 🎛️ **cała konfigurowalna treść per-portal** (#512 — questy, battle pass, custom alerty, konfig typów alertów, webhooki dostały `tenantId` + scoping) · 🧭 **hub „Moje portale"** follow/switch między portalami (#508, `/portals`) · 🆘 **asystent pomocy na każdej stronie** (#507 — statyczne FAQ + AI dla zalogowanych, graceful degrade). **Multi-tenant kompletny kodowo i danymi; zostaje tylko infra subdomen (`NEXT_PUBLIC_ROOT_DOMAIN` + DNS/cert + OAuth redirecty) by efekt „osobno per portal" stał się widoczny.**
>
> **🆕 Świeżo dowiezione (2026-06-19/20, PR #513–#554) — fala „donatr.ee + więcej":** 💸 **strona wsparcia / napiwków per portal** (#514 — linki płatności, krypto z QR BIP-21, IBAN masked + SEPA GiroCode; #519 cel zbiórki + share; #515 overlay OBS „Support QR"; #520 odkrywalność w stopce) · 🤖 **AI: Stream Recap → Discord** (#516) i **Clip Director** (hype czatu → auto-klip Twitcha, #517/#518) — **uśpione do czasu kluczy AI + webhooka/scope `clips:edit`** · 🎨 **picker motywów Dark/Light/Midnight/Slate** (#521 — re-tint tylko powierzchni, brand tenanta nietknięty) · 🧩 **builder widżetów: drag-to-resize** (#522) · ❓ **Trivia/Quiz za GT** (#523 + #524 runda live + overlay OBS) · 📊 **analityka ekonomii: trend dzienny + top earners/spenders** (#525) · 🔗 **share na profilu publicznym + Telegram jako social** (#526) + **QR profilu do pobrania** (#527) · 📊 **overlay OBS „pasek celu wsparcia"** (#528 — cel zbiórki #519 na żywo na streamie) · 💜 **ściana ostatnich wspierających** na `/support` (#529 — social proof z webhooków donejtów) + **🏆 ranking top wspierających** (#530) + **overlay OBS „tablica top wspierających"** (#531) · 🎨 **2 nowe motywy — Las i Śliwka** (#532, picker ma teraz 6) · 🔔 **web push — fundament** (#533 — przełącznik na `/profile`, SW handlers, `lib/web-push` VAPID-gated; **uśpione do czasu kluczy VAPID + db push**) + **trigger „LIVE teraz"** (#534 — `stream.online` → push do subskrybentów portalu, raz na stream) + **triggery donejt + cel osiągnięty** (#535 — tag `donation` zwija nawał napiwków) · 📅 **„Dodaj do kalendarza"** na `/schedule` (#536 — Google/iCal, cykl tygodniowy) · 📣 **admin: broadcast push + licznik subskrybentów** (#537 — „powiadom obserwujących") · 🤝 **menedżer sponsorów** (#538 — partnerzy per portal: panel `/admin#sponsors` + pasek logo na `/support`, `rel="sponsored"`; **db push**) + **overlay OBS „karuzela sponsorów"** (#539) · 🏳️ **flaga kraju na profilu** (#540 — picker na `/profile`, flaga przy nazwie na `/u/<nick>`; **db push** additive) · 📈 **analityka klików metod wsparcia** (#541 — `👆` per metoda w `/admin#payments`, beacon na `/support`; **db push** additive) + **klików linków społ. na profilu** (#542 — `👆` per link w edytorze profilu; **db push** additive) · 🔑 **passkeys — rejestracja i zarządzanie** (#543 — karta na `/profile`, WebAuthn przez `@simplewebauthn`, model `Passkey` **db push**; **izolowane od logowania OAuth**) + **logowanie passkey** (#544 — przycisk „Zaloguj się passkey", sesja DB tworzona 1:1 jak NextAuth, OAuth nietknięte; **wymaga testu na żywo z prawdziwym urządzeniem**) · 🛡️ **hardening po przeglądzie adversarialnym** (#545 — passkeys: rpID/origin+cookie pinowane do `NEXTAUTH_URL`, challenge single-use, wymagane UV, rate-limit + koniec enumeracji; web push: „LIVE" fire-and-forget w webhooku + timeout 5s na wysyłkach) · 🎨 **kolor akcentu profilu** (#546 — 10 presetów na pierścień awatara + poświatę nicku, obok flagi #540) · 🌐 **tłumaczenie czatu AI na overlayu** (#547 — `?translate=<lang>` w URL źródła OBS → tłumaczenie pod obcą wiadomością; uśpione do klucza AI, poza hot-path) · ⌨️ **paleta poleceń Ctrl/⌘ K** (#548 — szybka nawigacja fuzzy po stronach portalu) + **szukanie widzów** (#549 — skok do profilu `/u/<nick>`) · 🎬 **wizualny kreator scen overlay** (#550 — wiele widżetów na jednym płótnie 16:9, drag&resize, jedno źródło OBS = cała scena; kompozyt przez iframe'y, zero refaktoru istniejących overlayów) · 🃏 **karty kolekcjonerskie + paczki za GT** (#551 — faza 1 marketplace: handlowalny zasób; rzadkości ważone, atomowy zakup; `/collectibles` + `/admin#collectibles`) · 🏪 **marketplace P2P kart** (#552 — faza 2: wystaw/kup/anuluj za GT, escrow karty, atomowy transfer, 5% fee spalane = sink; `/market`) · 🎁 **prezenty GT P2P** (#553 — wyślij GT na profilu widza, atomowy transfer, limity 5k/transfer + 10k/24h, powiadomienie odbiorcy) · 🔎 **semantic search** (#554 — `/search` po znaczeniu: embeddingi AI + cosine, korpus stron/osiągnięć/sklepu, cache in-memory; uśpione bez klucza OpenAI). **Sekwencja „1/2/3 w kolejności" domknięta.** · 🔔 **web push AKTYWNY na prod** (klucze VAPID ustawione w Vercel — `/api/push/vapid` serwuje klucz) · 🛡️ **guard „dokumentacja nigdy się nie rozjedzie"** (#513 — `npm run docs:check` w CI + bramkach, root `CLAUDE.md`).

> **🆕 Świeżo dowiezione (2026-06-20, PR #555–…) — fala „audyt: security → perf → docs → UX":** 🛡️ **hardening z pełnego audytu** (#555 — **C1** reset-database za `requirePlatformOwner` + step-up 2FA zamiast `requireAdmin` (globalne `deleteMany` przez wszystkie tenanty); **H1** backup za `requirePlatformOwner` (czyt. cross-tenant); **H2** koniec IDOR na `social-click` — `updateMany` scoped do portalu; **H3** **`lib/ssrf-guard`** wpięty przed każdym fetchem webhooków wychodzących (blokada loopback/private/link-local/CGNAT/metadata, też po DNS); + odblokowany `tsc` (marker modułu na `seed-collectibles.ts`, TS2393)) · 🛡️ **mediums z audytu** (#556 — **M1** token overlay ściśle 1:1 per-tenant (koniec leaka default-row/env na inny portal); **M2** koniec null-tenant bypass w merge-users (ścisła równość `tenantId`, zawsze egzekwowana); **M3** predictions TOCTOU → `SELECT … FOR UPDATE` w wager/resolve/cancel; **M4** daily-bonus twardy unique przez `Transaction.externalId` — atomic counter dropów dojedzie z db push indeksów). · ⚡ **cache hot-path overlay** (#557 — settings + type-configs + token overlay przez `cacheJson`/Redis, ~3 zapytania/poll mniej przy puli DB max:3; cache bustowany przy rotacji tokenu). · ⚡ **Twitch EventSub ack-first** (#558 — szybki 2xx, granty/achievementy w tle przez `after()`/`waitUntil`; koniec ryzyka timeoutu→wyłączenia subskrypcji przy puli DB max:3). · ⚡ **semantic search: embeddingi współdzielone** (#559 — korpus+query w `cacheJson`/Redis cross-instance zamiast per-instance Map + in-flight dedup; mniej wywołań OpenAI na zimnym starcie). · ⚡ **/market: limity na findMany** (#560 — `take` na kolekcji widza + własnych listingach, koniec nieograniczonych odczytów). · ⚡🛡️ **indeksy per-tenant + atomowy licznik dropów** (#561, **db push** additive — 6 composite indeksów na hot-path tenant-scoped + `StreamDrop.claimCount` domyka M4-drops: koniec over-mintu bonusu przy równoległych claimach). · 📄 **docs-sync** (#562 — ARCHITECTURE: licznik testów 111→392 + nowa §9 „Model danych"; ENDPOINTS: 154→173 tras + 18 brakujących tras dopisanych). · 🧹 **quality** (#563 — test `wheel.parseSegments` +9; `.catch` na 11 fire-and-forget; usunięty obsolete `setup-vapid.mjs`). · ♿ **focus-trap + ARIA** (#564 — nowy hook `use-focus-trap` (trap+restore), CommandPalette jako combobox/listbox, reuse w GiftButton, zlokalizowany aria-label AccentPickera). · 🎨 **wspólny EmptyState/ErrorState** (#565 — collectibles/market/search/support używają jednego brandowanego empty/error + retry; `ErrorState` z lokalizowanym title/retry). · 🎨 **feedback marketplace** (#566 — potwierdzenie kupna + toast emerald/red auto-znikający zamiast bursztynowego banera). **Audyt (security→perf→docs→UX) domknięty (#555–#566).** · 🔒 **0 alertów `npm audit`** (#567 — overrides na `postcss`/`@hono/node-server` bez breaking downgradów next/prisma; runtime deps niezmienione, linuxowe binaria Vercela zachowane).

> **🆕 Świeżo dowiezione (2026-06-20, audyt v2, PR #568–…):** drugi głęboki audyt (5 agentów: security/perf/quality/UX/docs). 🛡️ **hardening współbieżności kasyna** (#568 — `withLock` per-sesja na Mines/Hi-Lo/Blackjack: koniec race'a „wymazania przegranej" przez nieatomowy read-modify-write w Redis; double blackjacka już nie pobiera 2. stawki przed claimem). · 🛡️ **atomowość resolverów + step-up** (#569 — heist atomowy claim (koniec double-payout), weekly-rewards per-tenant + idempotencja przez unique `externalId`, step-up 2FA na nadawaniu ról admin/mod, guard `gte` na dedukcji GT). · ⚡ **timeouty na zewnętrznych API** (#570 — `httpFetch` z 8s `AbortSignal.timeout` na Twitch/Kick/YouTube/Streamlabs/Steam; zawieszony upstream nie blokuje funkcji ani slotu puli DB max:3). · 🛡️ **rate-limity na kosztownych trasach** (#571 — recap LLM 10/5min, push/test 5/min, ai-reply globalny cap 300/h obok per-username). · 🛡️ **scoping odczytów admina** (#572 — alerts (koniec przecieku cudzych alertów), section-data BotConfig, stream-goals HypeTrainState, setup-status ModerationConfig — wszystkie per-tenant zamiast `id:"default"`/global). · 🛡️ **atomowość gift cap + account-XP** (#573 — `SELECT … FOR UPDATE`: limit 24h gift re-sprawdzany w tx (koniec obejścia burstem), account-XP `increment` pod lockiem zamiast read-modify-SET (koniec gubienia XP)). · ⚡ **chat-award ack-first** (#574 — najgorętsza ścieżka: XP sezonowy/questy/heatmapa do `after()`, odpowiedź wraca po samej transakcji nagrody; mniej presji na pulę DB max:3). · ⚡ **cache /support + gt-leaderboard** (#575 — publiczne odczyty: /support cały blob (5 zapytań + QR) 60s + pageQr per-host 5min; leaderboard kasyna 30-dniowy groupBy 60s). · 🧪 **testy** (#577 — `account-linking` sign/verify (HMAC, tamper, expiry) + `gt-mines.minesMultiplier` (RTP 0.95, cap); +11 → 412). · 🧹 **hygiene** (#578 — granice betu z `MIN_BET`/`MAX_BET` w 3 grach zamiast inline; mem-cache fallback z limitem FIFO 1000). · ♿ **a11y** (#579 — toast admina `aria-live`, NotificationItem i karta MergeUsers jako prawdziwe kontrolki klawiaturowe).

**Pozostałe duże kierunki:**
- **🏢 SaaS — odblokowania po stronie usera (kod 100% gotowy, zero programowania):** ① env Stripe (sekcja w README — 10 minut) → sprzedaż automatyczna; ② domena produktu + `NEXT_PUBLIC_ROOT_DOMAIN` + wildcard DNS w Vercel → subdomeny per tenant ożywają (overlaye i bot już przewleczone #432/#433; **per-tenant identity #510/#511 i cała konfigurowalna treść #512 też już przewleczone** — „kopiuj URL OBS" działa z natury); ③ odpalenie instancji bota per klient wg README `ghost-empire-chat` (`ENV_FILE=tenants/<slug>.env`); ④ opcjonalnie `ownerUserId` dla GE, by właściciel widział dashboard „Mój portal".
- **F6 — security/backup** (zrobione: backup JSON, sanityzacja URL, ✅ **szyfrowanie sekretów at-rest AES-256-GCM**, ✅ **nagłówki overlay `noindex`/`no-store`**, ✅ **cron czyszczący bazę**). Zostaje: auto-backup `pg_dump` na osobny bucket (decyzja: dokąd), AV uploadów.
- **Hardware (3C):** OBS WebSocket (panel integracji już przyjmuje adres+hasło), Philips Hue / Govee (efekty świetlne na donejty) — konta dev.
- ✅ **Emotki 7TV/BTTV/FFZ + prawdziwe grafiki odznak** — zrobione (#149).
- ~~**i18n PL/EN**~~ → ✅ **14 lokalizacji UI** (PL/EN/DE/ES/IT/FR/RU/UK/ZH/JA/KO/AR/PT/ID, AR=RTL); ~~E2E (Playwright)~~ → ✅ **aktywne (#412/#430/#436: 25 testów przeciw prod + workflow CI)**; ~~testy integracyjne~~ → ✅ **istnieją od #159** (11 testów, Docker Postgres, job CI); ~~Lighthouse~~ → ✅ **audyt wykonany lokalnie + fixy (#439)** — wariant CI dopiero po odblokowaniu GH Actions (billing).

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
| **Uptime / health-check** | 🟡 | ✅ Endpoint `/api/health` istnieje (status DB+Redis, 200/503) + per-IP rate-limit (#486). Zostaje: podpięcie zewnętrznego monitora (cron-job.org / UptimeRobot) — akcja usera |
| ~~**Alerty na anomalie ekonomii**~~ ✅ | — | **Zrobione (#161)** — `lib/economy-anomaly.ts`: pojedynczy grant ≥100k GT lub ≥500k GT/godz. → powiadomienie wszystkich adminów (link do audit logu) + `log.warn`. Fire-and-forget w `/api/admin/grant-tokens` |

---

## 3. Wydajność (kolejne kroki) 🟡

Dużo już zrobione (cache, indeksy, lazy admin, `staleTimes`, równoległe zapytania — patrz CHANGELOG). Następne:

| Propozycja | Pri | Notatki |
|---|---|---|
| **React Compiler** | ⛔ | Świadomie odroczony — auto-memoizacja. Reguły lintu (`react-hooks` v7) są już w configu po migracji Next 16 (**wyłączone** — flagują nasze wzorce). Wrócić, gdy będzie warto (po testach) |
| **`next/image` po wyjściu z Hobby** | 🟡 | Dziś natywne lazy `<img>` (oszczędność quoty optymalizatora). Po Pro warto przemierzyć na `next/image` (AVIF/WebP, auto-srcset) |
| ~~**Audyt rozmiaru bundla / code-split panelu**~~ ✅ | — | ✅ `@next/bundle-analyzer` (`npm run analyze` → treemapy `.next/analyze`) **oraz** `AdminClient.tsx` **już rozbity**: dziś **~870 linii** orkiestracji + **46 sekcji lazy** przez `next/dynamic` (każda osobny chunk; `SectionCard`+typy wyniesione). Stałe „~7k linii" było sprzed code-splitu (#148/#183/#437+). Zostaje już tylko ewentualny on-demand split shell-komponentów (DashboardSection/AdminNav) — 🧊 marginalny zysk |
| **Streaming / Suspense granice** | 🧊 | Progresywny render ciężkich list zamiast pełnego SSR-blokowania |
| **Redis/Upstash dla rate-limit + cache** | 🧊 | Dziś DB-backed (fail-open). Przy skali wynieść do Redisa (mniejszy narzut na Postgres) |
| **Tuning połączeń DB** | 🟡 | `connection_limit`/`pool_timeout` w Vercel env (patrz CHANGELOG — wymaga ręcznej zmiany przez usera) |

---

## 4. Bezpieczeństwo (kolejne kroki) 🟡

Solidna baza (HSTS, CSP, COOP, rate-limit, webhook verify, audit log — patrz CHANGELOG). Co dociągnąć:

| Propozycja | Pri | Notatki |
|---|---|---|
| ~~**CSP — `'unsafe-inline'` ze `script-src`**~~ ✅ | — | ✅ **(#164)** `'unsafe-eval'` + ✅ **(#192)** `'unsafe-inline'` wycięte ze `script-src` przez **per-request nonce + `'strict-dynamic'`** w `src/proxy.ts` (wymusza dynamiczny render wszystkich tras). `style-src 'unsafe-inline'` zostaje (inline `style=` w overlayach). Strażnik E2E naruszeń CSP w CI. *(Do potwierdzenia na prodzie: skrypty Vercel Analytics — tylko na infra Vercela.)* |
| ~~**2FA / step-up dla akcji admina**~~ ✅ | — | **Zrobione (#490/#491/#496)** — opt-in TOTP (RFC-6238 ręcznie, sekret szyfrowany at-rest, **QR przy włączaniu**), egzekucja `requireStepUp` na wrażliwych akcjach: granty ≥10k GT, **bany**, **merge userów** wymagają świeżego kodu od adminów, którzy 2FA włączyli (no-op dla pozostałych). Testy na wektorach RFC-4226. |
| ~~**Audyt zależności**~~ ✅ | — | **Zrobione (#156)** — `npm audit --omit=dev --audit-level=high` w CI (nieblokujący) + Dependabot (patrz §1) |
| ~~**Rotacja sekretów + skan**~~ ✅ | — | **Zrobione** — skan: **GitGuardian** (na PR) + **runbook rotacji** w [docs/ENV.md §5](docs/ENV.md) (`BOT_SECRET`/`NEXTAUTH_SECRET`/`ENCRYPTION_KEY`/OAuth/EventSub/tokeny botów/webhooki) |
| ~~**Rate-limit per-IP na publicznych API GET-ach**~~ ✅ | — | **Zrobione (#486)** — `extractIp`+`rateLimit` (Redis+fallback DB) na `/api/games`/`gt-games/jackpot`/`health`. Zostaje opcjonalnie warstwa edge/IP na publicznych *stronach* (RSC) — 🧊 |

---

## 5. Dostępność (a11y) i UX 🟡

| Propozycja | Pri | Notatki |
|---|---|---|
| **Audyt a11y** (axe / Lighthouse) | 🟡 | ✅ focus-visible, nawigacja klawiaturą, `aria-label` na navach, `aria-current`, **`role="dialog"`+`aria-modal` na modalach edytorów** (A4 + a11y passes), ✅ **`prefers-contrast: more`** (#487 — rozjaśnia szarości/czerwień do ≥AA przy opt-in OS). Zostaje: pełny sweep domyślnej palety (brand-red w stylach inline), reszta modali/dropdownów |
| ~~**Skip-to-content + landmarki**~~ ✅ | — | **Zrobione** — skip-link „Przejdź do treści" (A4) + `<main>` per-strona + opisane nawigacje/stopka |
| **i18n (14 lokalizacji)** | ✅ **done** | ✅ **14 lokalizacji UI** (PL/EN/DE/ES/IT/FR/RU/UK/ZH/JA/KO/AR/PT/ID) = po 1963 klucze = 100% (#194 scaffold → #253–#359 pełne tłumaczenia), **AR = RTL**. Przyszłe i18n = tylko klucze nowych funkcji |
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
