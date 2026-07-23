# PLAN-EKOSYSTEM.md — program rozwoju (portal + 2 rozszerzenia)

Master-plan realizacji pomysłów z sesji 2026-07-19. Obejmuje 3 projekty workspace `Platform/`:
**`Platforma/ghost-empire`** (portal Next.js), **`nx-chat-tools`** (WXT — moderacja + emotki),
**`nx-companion`** (WXT — overlay portalu). Szczegółowe backlogi per projekt: [`IDEAS.md`](IDEAS.md)
(ten sam katalog, portal) oraz `IDEAS.md` w osobnych repo `nx-chat-tools` i `nx-companion`.
_(Ten plan mieszka w repo `ghost-empire/docs/`; przeniesiony z korzenia workspace 2026-07-23, by był wersjonowany.)_

## Cel

Podnieść jakość, wydajność, UI/UX (szczególnie animacje) i funkcje — z naciskiem na rozszerzenia —
utrzymując zero regresji i pełną dokumentację (wg `CLAUDE.md` każdego repo).

## Zasady realizacji (obowiązują w każdej fazie)

- **Weryfikacja przed „done":** `pnpm typecheck` + `pnpm build` (+ `build:firefox`) dla rozszerzeń;
  dla portalu `tsc/lint/test/build`. ⚠️ *Uwaga środowiskowa:* ścieżka workspace zawiera spację
  („Moje Projekty") + Node 26 → **vitest może nie startować lokalnie** (znany problem, patrz komentarz
  w `.gitlab-ci.yml`). Testy jednostkowe egzekwuje wtedy **CI (GitLab, Linux)**; lokalnie polegamy na
  typecheck + build.
- **Dokumentacja w tym samym kroku** co kod (CHANGELOG `[Unreleased]`, README/IDEAS, komentarze).
- **Animacje:** wyłącznie `transform`/`opacity` (kompozytor), zawsze `prefers-reduced-motion` +
  przełącznik „ogranicz animacje".
- **Bezpieczeństwo:** twarde reguły ESLint zostają (zakaz `innerHTML`/`any`); zero zdalnego kodu.
- **Portal-prod jest bramkowany:** `db push`/seedy/real-time na żywym Supabase — tylko za wyraźną zgodą.

## Legenda dźwigni

🤖 czysty kod (zero kont) · 🔑 wymaga kluczy/kont · 🌐 dotyka prod-portalu · 🎨 kierunek wizualny · ⚠️ decyzja właściciela

---

## Kolejność i ścieżka krytyczna

```
Faza 0 (dok.) ─► Faza 1 (UI/anim @ companion) ─► Faza 2 (UI/anim @ chat-tools)
                                                   │
                      Faza 3 (wydajność) ◄─────────┘
                      Faza 4 (funkcje)   ◄── zależy od 1–3
                      Faza 5 (jakość/CI) ── równolegle od Fazy 1
                      Faza 6 ⚠️ (monorepo @nx/shared) ── po ustabilizowaniu 1–4
                      Faza 7 🌐 (portal + real-time + Sentry) ── koordynacja z prod
                      Faza 8 🔑 (wydanie/store) ── Twoje konta
```

**Dlaczego taka kolejność:** najpierw dowozimy widoczną wartość (UI/animacje) w mniejszym,
prostszym `nx-companion`, potem przenosimy sprawdzony system do bogatszego `nx-chat-tools`;
wydajność i jakość idą zaraz za tym. **Monorepo (Faza 6) świadomie po**, bo dopiero wtedy wiadomo,
co realnie jest wspólne — i to jedyny krok zmieniający topologię repo (decyzja ⚠️). Rzeczy dotykające
produkcji (real-time) i konta (store) są na końcu.

---

## Fazy

### Faza 0 — Plan i dokumentacja 🤖 ✅ (ten dokument)
- **Zakres:** ten plan + `IDEAS.md` w każdym projekcie (kuracja pomysłów z priorytetami i „dlaczego").
- **Weryfikacja:** dokumenty spójne, linkują się wzajemnie. **Dok.:** CHANGELOG rozszerzeń.

### Faza 1 — UI/UX + animacje w `nx-companion` 🤖🎨
- **Cel:** żywy, dopracowany overlay bez janku na streamie; fundament systemu ruchu.
- **1a ✅ (dowieziona):** moduł `src/core/motion.ts` (reduced-motion-aware `countUp`/`playPop` + czyste
  `easeOutCubic`/`frameValue`, +5 testów), **count-up salda GT** (live-refresh/quest/drop), **„pop"**
  przy zwijaniu/rozwijaniu. Weryfikacja: typecheck/lint/build ×2/25 testów — zielone.
- **1b ✅ (dowieziona):** przeciąganie overlaya + snap do rogu (`overlay-position.ts`, pozycja w
  `storage.local`, +4 testy), auto-dim po bezczynności, pasek sezonu na `transform:scaleX` (`fillBar`).
  Weryfikacja: typecheck/lint/build ×2/29 testów — zielone.
- **1c ✅ (dowieziona):** przełącznik „ogranicz animacje" w opcjach (`settings.ts` + `SettingsPanel` +
  override `setForceReducedMotion`; a11y — tylko dodaje ograniczenie). Weryfikacja: 33 testy zielone.
  *(Crossfade skeleton→treść pominięty — pokryty fade-inem `nxco-in`.)*
- **➡️ Faza 1 KOMPLETNA.** Następny krok: **Faza 2** (przeniesienie systemu ruchu do nx-chat-tools).
- **⚠️ Korekta:** w content-scripcie **nie** używamy `document.startViewTransition` (snapshotuje całą stronę
  hosta → jank). Animacje lokalne (transform/opacity). View Transitions tylko na własnych stronach (popup/options).
- **Zależności:** brak. **Wysiłek:** M. **Ryzyko:** niskie (samodzielne, per-repo).
- **Weryfikacja:** `pnpm typecheck && pnpm lint && pnpm build && pnpm build:firefox && pnpm test`. **Dok.:** CHANGELOG, README, IDEAS.

### Faza 2 — UI/UX + animacje w `nx-chat-tools` 🤖🎨
- **Cel:** przenieść dopracowany ruch na moderację/emotki.
- **⚠️ Decyzja architektoniczna:** nx-chat-tools jest **CSS-first** (scentralizowany `styles.ts`,
  klasy `nx-`, istniejące `@media prefers-reduced-motion`). Dlatego **nie** portujemy JS-owego
  `motion.ts` z companiona tam, gdzie wystarcza CSS — dopasowanie do idiomu repo > ślepe kopiowanie.
- **2a ✅ (dowieziona):** emote pop-in (`nx-emote-in`, scale+fade) + puls comba „×N" (`nx-combo-pop`),
  CSS w `styles.ts` + drobny `pulseCombo` w content. Weryfikacja: typecheck/lint/build ×2/181 testów — zielone.
- **2b ✅ (dowieziona):** **live-gauge nastroju** (mood-ring) — diverging `scaleX` od środka. *Uczciwa korekta:*
  hype = event, toxicity = kolor wiadomości; jedyny trwały miernik to mood, więc on dostał gauge. 181 testów zielone.
- **2c ✅ (dowieziona):** **command palette (⌘K/Ctrl+K)** — fuzzy-search zakładek panelu (reużywalny
  `command-palette.ts` + czysty matcher, +5 testów, i18n PL/EN, hint w Pomocy). **186 testów** zielone.
- **➡️ Faza 2 KOMPLETNA.** Następny krok: **Faza 3** (wydajność obu rozszerzeń).
- **Zależności:** wzorce z Fazy 1. **Wysiłek:** M/L. **Ryzyko:** niskie–średnie (dużo powierzchni UI).
- **Weryfikacja:** typecheck + lint + build ×2 + vitest (186) + smoke Playwright. **Dok.:** CHANGELOG, IDEAS, listingi store.

### Faza 3 — Wydajność (oba rozszerzenia) 🤖 ✅
- **⚠️ Wynik audytu:** hot-pathy nx-chat-tools **już zoptymalizowane** przez autora — rAF-batch obserwatora
  + `WeakSet` dedup + `attributeFilter:['class']`; renderer idempotentny z jednym `replaceWith` na fragmencie;
  cache emotek pamięć+`storage.local` TTL 1h/invalidacja per kanał; regexy prekompilowane + guard ReDoS; tokenizer O(n).
  Companion: cache w `storage.local`, animacje tylko `transform`/`opacity`. **Większość hipotetycznych wins była już zrobiona.**
- **✅ Dowieziono:** **budżet rozmiaru bundla** — `scripts/check-bundle-size.mjs` + `pnpm size` w OBU repo
  (content + suma JS; guard dla kodu ładowanego każdemu userowi). Zielone na obecnych buildach.
- **❌ Odrzucono na analizie:** **Web Worker** do toksyczności/regex — byłby WOLNIEJSZY: compute per-wiadomość
  jest tani/ograniczony, stały narzut `postMessage` przewyższyłby zysk. (Worker = drogi compute, nie tania pętla.)
- **Zależności:** 1–2. **Weryfikacja:** build ×2 + `pnpm size`. **Dok.:** CHANGELOG ×2, IDEAS ×2. **Uczciwość > fabrykowanie „optymalizacji".**

### Faza 4 — Funkcje 🤖 (część 🌐/🔑 odłożona)
- **⚠️ Audyt nx-chat-tools:** proponowane feature'y **już istnieją** — skróty moda (`moderation/ui.ts`
  `attachShortcuts`, gated `settings.shortcuts`), leaderboard emotek (`stats.ts` `topEmotes`), listy
  watch/ignore/mute (`storage.sync` = już współdzielone przez profil). **Nie reimplementuję istniejącego.**
- **✅ companion (dowieziono):** **celebracja nagrody** — ulatujące „+N GT" (`floatReward`) przy udanym
  drop-code/queście. +1 test; build ×2 + size zielone.
- **⏭️ Odłożone (uzasadnione):** „Utnij clip" 🔑 (Twitch Clip API/OAuth); „drop-code live" 🌐 (pole w
  `/api/discover` po stronie portalu); tier-up 🤖 (wymaga live-refreshu tasks/season — większa zmiana).
- **Zależności:** 1–3. **Dok.:** CHANGELOG, IDEAS.

### Faza 5 — Jakość i narzędzia 🤖 ✅ (rdzeń)
- **✅ Dowieziono:** rozbudowa **GitLab CI** w obu repo — etap `build` (build Chrome/Firefox + `pnpm size`
  + `web-ext lint` w chat-tools + artefakty zip), wspólny setup przez anchor YAML. **Renovate** (`renovate.json`)
  w obu repo. Komendy CI zwalidowane lokalnie (zip/size/lint:ext = 0 errors); YAML/JSON zwalidowane.
- **⏭️ Odłożone (uzasadnione):** **E2E companiona** (MSW) — wymaga dodania Playwright + przeglądarki
  (nie do zweryfikowania w tym środowisku); **visual regression** + **Storybook** (środowisko przeglądarkowe);
  lokalny licznik zdrowia selektorów (drobne, opcjonalne).
- **Zależności:** brak. **Weryfikacja:** JSON/YAML valid + lokalne odpalenie komend CI. **Dok.:** CHANGELOG ×2, CLAUDE ×2, IDEAS.

### Faza 6 — Konsolidacja `@nx/shared` — ✅ DECYZJA: NIE konsolidować (2026-07-19)
- **Decyzja właściciela:** **nie robimy monorepo.** Uzasadnienie: praca w Fazach 1–2 pokazała, że realnie
  wspólna powierzchnia jest MAŁA (parsowanie URL→kanał, reguły ESLint bezpieczeństwa), a systemy animacji
  się rozjechały (companion = JS `motion.ts`, chat-tools = CSS-first). Koszt restrukturyzacji dwóch osobnych
  repo (historia git, ścieżki CI) > zysk.
- **✅ Zamiast tego (dowieziono):** duplikacja **udokumentowana** jako „sync ręczny" w obu `CLAUDE.md`
  (sekcja „Shared logic with the sibling extension"): parsowanie URL→kanał (`channel.ts` ↔ `*Adapter.ts`,
  ⚠️ listy reserved już lekko rozjechane) + reguły ESLint. Zmieniasz jedno → zmień drugie.
- **Dok.:** `nx-companion/CLAUDE.md`, `nx-chat-tools/CLAUDE.md`.

### Faza 7 — 🌐 Portal + real-time + observability (część nie-prod dowieziona)
- **✅ Dowieziono (czysty kod, zero dotykania prod):** **strażnik dryfu ENV** — `scripts/check-env-docs.mjs`
  + `npm run docs:env` (każda `process.env.X` musi być w `docs/ENV.md`; wzorce + built-iny obsłużone).
  Uruchomiony **wykrył i naprawił realny drift** — 2 nieudokumentowane zmienne (`META_IG_TOKEN`, `X_API_TOKEN`)
  dopisane do ENV.md. Wpięty w bramki CLAUDE.md. Zielone (65/65).
- **⏭️ Odłożone — wymaga Twojego dostępu/prod:** **push zamiast pollingu** (Supabase Realtime/SSE — dotyka
  żywego Supabase, backup+zgoda); **Sentry** (`NEXT_PUBLIC_SENTRY_DSN` już w kodzie — brakuje DSN + instrumentacji);
  **edge-cache** `/api/companion/branding`; **PDF-handbooki z markdownu** (potrzebny `pandoc`/plugin — narzędzie do instalacji).
- **❌ Strażnik route↔`ENDPOINTS.md` — zbudowany, skalibrowany, ODRZUCONY (nie wypuszczony):** prototyp
  flagował 26→(po kalibracji `·`/`…/`)→7 route'ów; **weryfikacja wszystkich 7 pokazała, że KAŻDY jest
  udokumentowany**, tylko niespójną notacją człowieka (`·`, `…/` = raz dziecko raz rodzeństwo, `+ /callback`,
  `(+callback)` plain-text, dynamiczne `[feed]` opisane przez konkretne instancje). Notacja nie jest
  parsowalna maszynowo bez fałszywych alarmów → guard skasowany. **Pozytyw:** audyt potwierdził, że
  `ENDPOINTS.md` **jest w sync** (wszystkie 205 route'ów opisane). Kontrast z ENV (proste tokeny → guard się opłacił).
- **Dok.:** ghost-empire `docs/ENV.md`, `CHANGELOG.md`, `CLAUDE.md`.

### Faza 8 — 🔑 Wydanie / store (Twoje konta)
- **Zakres:** uzupełnić e-mail w politykach, zrzuty ekranu, publiczny URL polityki, submit Chrome/AMO
  (wg `store/submission-checklist.md` obu rozszerzeń). **Robisz Ty** (konta/opłaty/regulaminy) — ja
  przygotowuję paczki i teksty. **Dok.:** CHANGELOG (bump wersji).

---

## Co wymaga Ciebie (poza czystym kodem)
- **Faza 6** ⚠️ — wybór topologii repo dla monorepo.
- **Faza 7** 🌐 — zgoda na zmiany dotykające prod-Supabase; DSN Sentry.
- **Faza 4/7** 🔑 — Twitch Clip API scope (`clips:edit`) do „Utnij clip".
- **Faza 8** 🔑 — konta Chrome/AMO, opłata 5 USD, e-mail kontaktowy, hosting URL polityki.

## Status
- **Faza 0:** ✅ dowieziona (ten plan + `IDEAS.md` w 3 projektach + wpisy CHANGELOG).
- **Faza 1a:** ✅ dowieziona (nx-companion: `motion.ts` + count-up salda + „pop"; 25 testów).
- **Faza 1b:** ✅ dowieziona (nx-companion: drag+snap do rogu + auto-dim + gauge scaleX; 29 testów).
- **Faza 1c:** ✅ dowieziona (nx-companion: przełącznik „ogranicz animacje"; 33 testy). **Faza 1 KOMPLETNA.**
- **Faza 2a:** ✅ dowieziona (nx-chat-tools: emote pop-in + puls comba, CSS-first; 181 testów).
- **Faza 2b:** ✅ dowieziona (nx-chat-tools: live-gauge nastroju/mood, diverging scaleX; 181 testów).
- **Faza 2c:** ✅ dowieziona (nx-chat-tools: command palette ⌘K; **186 testów**). **Faza 2 KOMPLETNA.**
- **Faza 3:** ✅ dowieziona (audyt: hot-pathy już optymalne; **budżet bundla** w obu repo; Web Worker odrzucony na analizie).
- **Faza 4:** ✅ dowieziona (companion: `floatReward`; nx-chat-tools feature'y już istnieją; clip/drop-live odłożone 🔑🌐).
- **Faza 5:** ✅ dowieziona (rdzeń: CI etap `build`+size+web-ext lint + Renovate w obu repo; E2E/Storybook odłożone — potrzebują przeglądarki).
- **Faza 6:** ✅ zamknięta decyzją — **NIE konsolidować**; duplikacja udokumentowana jako „sync ręczny" w obu CLAUDE.md.
- **Faza 7:** 🟡 część nie-prod dowieziona (**strażnik ENV** `docs:env` — wykrył+naprawił drift 2 zmiennych). Reszta (real-time/Sentry/edge/PDF) czeka na dostęp/prod.
- **Faza 8** 🔑 (store) — **czeka na Twoje konta** (patrz „Co wymaga Ciebie").
- **Fazy 0–6 zamknięte; Faza 7 częściowo (czysty kod zrobiony, prod-zależne odłożone).**

### Środowisko (weryfikacja lokalna)
Potwierdzone 2026-07-19: mimo spacji w ścieżce + Node 26, w `nx-companion` działa **pełny** zestaw
lokalnie (`typecheck`/`lint`/`build ×2`/`vitest` — 25 testów). Czyli weryfikujemy lokalnie, nie tylko w CI.
