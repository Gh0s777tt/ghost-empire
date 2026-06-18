# 💡 IDEAS.md — backlog pomysłów + mini-specy

Kuracja pomysłów na rozwój Ghost Empire (funkcje · narzędzia · wygląd · nowoczesna platforma), z mini-specami flagowców gotowymi do wdrożenia tym samym przepływem co dotychczasowe PR-y (branch → tsc/lint/test/build → PR). Powstał z sesji brainstormu 2026-06.

> **Legenda dźwigni:** 🤖 czysty kod (zero kluczy) · 🔑 wymaga kluczy/kont · 🎨 wymaga kierunku wizualnego.
> Powiązane: [ROADMAP](../ROADMAP.md) · [PLAN](../PLAN.md) · [ARCHITECTURE](ARCHITECTURE.md).

---

## 🎯 Priorytety (wpływ × wysiłek)

- **Szybkie wygrane (zrób najpierw):** landing page · WebSockets + presence · Web Push + PWA · AI Stream Recap · activation checklist.
- **Duże zakłady (świadome inwestycje):** 🎬 AI Clip Director · 🐾 Ghost Companion (pet idle) · 🛡️ klany · 🧩 wizualny builder overlayów.
- **Higiena/fundament:** ✅ dashboard zdrowia ekonomii (dowieziony) · view transitions · passkeys.

---

## 🚩 Flagowce — mini-specy

### 🎬 AI Clip Director — 🔑
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

### 🧩 Wizualny builder overlayów (no-code canvas) — 🤖🎨
Upgrade generatora widgetów (`CustomWidget`) do edytora drag-drop „Figma dla overlayów": warstwy, pozycja, fonty/gradienty (masz F1/F5), bindowanie danych (last sub/donator/viewers).
- **Podejście:** canvas (React + DnD), zapis layoutu JSON w rozszerzonym `CustomWidget`, render w `/overlay/widget`.
- **Wysiłek:** L. Killer-tool, który sam sprzedaje plan pro (synergia z bramką `overlays`).

### 💹 Dashboard zdrowia ekonomii — ✅ DOWIEZIONY
`/admin#economy`: GT w obiegu + 30-dniowy bilans wytworzone/spalone + top źródła/spusty + status (inflacja/zdrowa/kurczy się). `lib/economy-health.ts` (czysty + testy) + `api/admin/economy-health`. Chroni wartość GT przy mnogości kranów.

---

## 🤖 Tor AI (masz `lib/ai.ts` — czeka na klucz z quotą)
- **AI Stream Recap** — po streamie auto-podsumowanie (highlighty, top widzowie, cytaty, statystyki) → Discord/X.
- **Semantyczny search VOD/czat** — embeddingi + **pgvector** (masz Postgres, zero nowej infry).
- **AI tłumacz czatu na żywo** — wielojęzyczny czat (masz 14 lokalizacji).
- **AI moderacja kontekstowa** — toksyczność z kontekstem jako rozszerzenie automoda.

## ⚡ Tor nowoczesnej platformy (jesteś na Vercel Pro)
- **SSE → WebSockets + presence** — prawdziwy realtime, „kto teraz ogląda portal".
- **Web Push + PWA** — natywne „streamer LIVE!" + instalowalna apka (VAPID, bez third-party).
- **View Transitions API + Framer Motion** — płynne przejścia + mikro-interakcje.
- **Passkeys (WebAuthn)** — logowanie bez hasła obok OAuth.

## 🎨 Tor wyglądu
- **Landing page** (🎨 — realnie blokuje sprzedaż): hero z animacją, social proof, CTA.
- **System motywów** — presety + edytor (masz brand-color per tenant).
- **Piękna analityka** — animowane wykresy, cohort-retention.
- **Reaktywne overlaye** — cząsteczki/fizyka, WebGL/WebGPU (masz kości 3D).

## 🧰 Tor narzędzi twórcy
- **Marketplace szablonów** overlayów (UGC = wzrost SaaS).
- **Menedżer sponsorów** — segmenty, auto-overlay, raporty.
- **Mobilny companion / Stream Deck plugin**.
- **A/B testy komend/alertów** (jest w ROADMAP 3D).

## 📈 Tor SaaS
- **Activation checklist + onboarding funnel** → „aha-moment".
- **Tygodniowe digesty email** (🔑 dostawca maila) → retencja właścicieli.
- **Program partnerski + Public API/pluginy** → ekosystem (fosa).

---

## 🧠 Insighty (nieoczywiste)
- **Zdrowie ekonomii** — dużo kranów GT, mało spustów → ryzyko inflacji. (✅ adresowane dashboardem; kolejne spusty: pet, kosmetyki, aukcje.)
- **Retencja > akwizycja** — idle/social loops (pet, klany) dają lepszy zwrot niż kolejna gra do kasyna.
- **AI to Twój wyróżnik** — masz wpiętą infrę; konkurencja (StreamElements/Streamlabs) nie ma dobrego AI Clip Directora.

---

_Aktualizuj przy każdym nowym pomyśle lub gdy flagowiec ląduje na produkcji (przenieś do „dowiezione")._
