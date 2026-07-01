# 💡 IDEAS.md — backlog pomysłów + mini-specy

Kuracja pomysłów na rozwój Ghost Empire (funkcje · narzędzia · wygląd · nowoczesna platforma), z mini-specami flagowców gotowymi do wdrożenia tym samym przepływem co dotychczasowe PR-y (branch → tsc/lint/test/build → PR). Powstał z sesji brainstormu 2026-06.

> **Legenda dźwigni:** 🤖 czysty kod (zero kluczy) · 🔑 wymaga kluczy/kont · 🎨 wymaga kierunku wizualnego.
> Powiązane: [ROADMAP](../ROADMAP.md) · [PLAN](../PLAN.md) · [ARCHITECTURE](ARCHITECTURE.md).

---

## 🎯 Priorytety (wpływ × wysiłek)

- **Szybkie wygrane:** ✅ landing page · WebSockets + presence *(wciąż SSE — niezrobione)* · ✅ Web Push + PWA · ✅ AI Stream Recap · activation checklist.
- **Duże zakłady:** 🟡 AI Clip Director *(detekcja gotowa, brak publikacji)* · ✅ Ghost Companion · ✅ klany · ✅ wizualny builder overlayów (faza 1).
- **Higiena/fundament:** ✅ dashboard zdrowia ekonomii · ✅ view transitions · ✅ passkeys.

---

## 🚩 Flagowce — mini-specy

### 🎬 AI Clip Director — 🟡 CZĘŚCIOWO DOWIEZIONY
> **Stan (audyt 2026-06):** detekcja momentów + tworzenie klipu jest na produkcji (#517 — `lib/clip-director.ts`, model `ClipDirectorConfig`, `/admin#clip-director`, dormant do włączenia). **Pozostała część:** kolejka publikacji na Shorts/TikTok/Reels (`ClipPublishJob` + OAuth upload) — niezrobiona.
Wykrywa szczyt zaangażowania (sentyment/tempo czatu, hype train, gwałtowny wzrost widzów) → tworzy klip → AI generuje tytuł + miniaturę → kolejka publikacji na Shorts/TikTok/Reels.
- **Modele:** `ClipMoment { id, tenantId, source, detectedAt, score, twitchClipId?, title?, status }` + `ClipPublishJob { id, clipId, platform, status, externalUrl? }`.
- **Detekcja:** rolling-window licznik wiadomości/min + emotki-combo (masz `EmojiComboState`) + EventSub `channel.hype_train.*`; próg konfigurowalny w `/admin#clips`.
- **Pipeline:** cron/worker → Twitch Clip API (`POST /helix/clips`) → `lib/ai.ts` (tytuł + alt-text miniatury) → kolejka publikacji (TikTok/YT Shorts API).
- **Klucze:** AI provider (masz adapter), Twitch scope `clips:edit`, OAuth TikTok/YT upload.
- **Wysiłek:** L (3–5 PR-ów: detekcja → klip → AI-tytuł → publikacja → panel).

### 🐾 Ghost Companion — pet idle-game — ✅ MVP DOWIEZIONY
Widmowy kompan; widzowie karmią go GT (**realny spust!**), ewoluuje przez 6 etapów. **MVP na produkcji:** model `Companion`, `lib/companion.ts` (6 etapów + progres, +5 testów), strona `/companion` (karmienie + zmiana imienia), atomowy spend (wzorzec sklepu), link w nawigacji (grupa GRY), i18n PL/EN. **⚠️ wymaga `db push`.** **Follow-up:** overlay `/overlay/companion`, kafelek na `/profile`, decay/streak, sekcja admina (etapy/koszty).
- **Modele:** `Companion { id, userId @unique, name, stage, xp, lastFedAt, evolution }`.
- **Logika (czysta, testowalna):** `companionStage(xp)`, `feedCost(stage)`, decay/bonus za streak; karmienie = atomowy spend GT (wzorzec jak sklep) → realny **spust GT** (synergia z dashboardem ekonomii).
- **UI:** kafelek na `/profile` + sekcja `/admin` (etapy/koszty) + overlay `/overlay/companion?token=`.
- **Wysiłek:** M. **⚠️ db push.** Idle-mechaniki są ekstremalnie lepkie → silny hak retencyjny, biały obszar na rynku streamerskim.

### 🛡️ Klany / drużyny — ✅ MVP DOWIEZIONY
Widzowie tworzą drużyny: wspólny skarbiec GT (**realny spust!**) i ranking klanów. **MVP na produkcji:** model `Clan` + `User.clanId/clanRole` (jeden klan/usera), `lib/clans.ts` (walidacja tag/nazwa/wpłata, +4 testy), strona `/clans` (załóż/dołącz/wpłać/opuść + ranking skarbców), atomowe spendy (wzorzec sklepu), link w nawigacji (grupa SPOŁECZNOŚĆ), i18n PL/EN. **⚠️ wymaga `db push`.** **Follow-up:** wojny klan-vs-klan (re-use `Season`), perki ze skarbca, sekcja admina.

### 🧩 Wizualny builder overlayów (no-code canvas) — 🟡 MVP DOWIEZIONY (faza 1)
**Faza 1 na produkcji:** wolne pozycjonowanie drag-and-drop dla custom-widgetów — canvas 16:9 w `/admin#widgets` (klik/przeciągnij ustawia `posXPct/posYPct`), render w `/overlay/widget` z fallbackiem `null` → 9 slotów (**zero regresji** dla istniejących widgetów). **⚠️ wymaga `db push`.**
- **Follow-up (faza 2):** wiele elementów na jednym canvasie (sceny), skalowanie/rotacja, bindowanie danych live (last sub/donator/viewers).
- Killer-tool, synergia z bramką `overlays`.

### 💹 Dashboard zdrowia ekonomii — ✅ DOWIEZIONY
`/admin#economy`: GT w obiegu + 30-dniowy bilans wytworzone/spalone + top źródła/spusty + status (inflacja/zdrowa/kurczy się). `lib/economy-health.ts` (czysty + testy) + `api/admin/economy-health`. Chroni wartość GT przy mnogości kranów.

---

## 🤖 Tor AI (masz `lib/ai.ts` — czeka na klucz z quotą)
- ✅ **AI Stream Recap** (dowiezione) — po streamie auto-podsumowanie (highlighty, top widzowie, cytaty, statystyki) → Discord/X.
- ✅ **Semantyczny search** (dowiezione, #554) — embeddingi (`lib/semantic.ts`, `/search`).
- **AI tłumacz czatu na żywo** — wielojęzyczny czat (masz 14 lokalizacji). *(niezrobione)*
- ✅ **AI moderacja kontekstowa** (dowiezione) — toksyczność z kontekstem jako rozszerzenie automoda.

## ⚡ Tor nowoczesnej platformy (jesteś na Vercel Pro)
- ✅ **Presence — „kto teraz ogląda portal"** (dowiezione, #767) — realtime licznik online (Redis ZSET + heartbeat + SSE; WebSocket-serwer nie działa na Vercel serverless, ta architektura daje tę samą wartość). Badge na home + overlay `/overlay/presence`.
- ✅ **Web Push + PWA** (dowiezione, #533) — natywne „streamer LIVE!" + instalowalna apka (VAPID, bez third-party).
- ✅ **View Transitions API** (dowiezione, #479) — płynne przejścia + mikro-interakcje.
- ✅ **Passkeys (WebAuthn)** (dowiezione, #543) — logowanie bez hasła obok OAuth.

## 🎨 Tor wyglądu
- ✅ **Landing page** (dowiezione) — hero + CTA „Załóż własny portal" (#660), sekcja społeczności.
- ✅ **System motywów** (dowiezione, #521/#532) — presety + edytor (brand-color per tenant).
- ✅ **Piękna analityka** (dowiezione, #769) — animowane wykresy (nowi/GT-flow 30d) + cohort-retention 8 tyg. w `/admin#analytics`.
- ✅ **Reaktywne overlaye** (dowiezione, #770) — particle burst (canvas 2D, fontanna z fizyką) za każdym alertem; strojenie `?particles=`. WebGL świadomie pominięty (koszt kontekstu w OBS bez zysku przy tej liczbie cząstek).

## 🧰 Tor narzędzi twórcy
- 🟡 **Marketplace szablonów** overlayów — faza 1 DOWIEZIONA (#771): kurowany katalog 6 szablonów scen, 1 klik → edytowalna scena. Faza 2 (UGC + udostępnianie między streamerami) — otwarta.
- ✅ **Menedżer sponsorów** (dowiezione, #538) — partnerzy + overlay `/overlay/sponsors`; *follow-up:* segmenty, raporty.
- **Mobilny companion / Stream Deck plugin**.
- **A/B testy komend/alertów** (jest w ROADMAP 3D).

## 📈 Tor SaaS
- ✅ **Activation checklist + onboarding funnel** (dowiezione, #772) — kroki aktywacyjne (sklep/event/płatność/drop) w Setup Wizard, derived z realnych danych.
- ✅ **Tygodniowe digesty email** (dowiezione #773, dormant) — cron pon. 07:00 → raport 7 dni do właścicieli portali; aktywacja = `RESEND_API_KEY`+`EMAIL_FROM` w Vercel.
- **Program partnerski + Public API/pluginy** → ekosystem (fosa).

---

## 🧠 Insighty (nieoczywiste)
- **Zdrowie ekonomii** — dużo kranów GT, mało spustów → ryzyko inflacji. (✅ adresowane dashboardem; kolejne spusty: pet, kosmetyki, aukcje.)
- **Retencja > akwizycja** — idle/social loops (pet, klany) dają lepszy zwrot niż kolejna gra do kasyna.
- **AI to Twój wyróżnik** — masz wpiętą infrę; konkurencja (StreamElements/Streamlabs) nie ma dobrego AI Clip Directora.

---

_Aktualizuj przy każdym nowym pomyśle lub gdy flagowiec ląduje na produkcji (przenieś do „dowiezione")._
