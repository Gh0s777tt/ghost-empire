# 🎛️ OBS-CONTROL.md — sterowanie OBS przez zdarzenia (PHASE 3C)

Niech donejty / suby / inne alerty **automatycznie** przełączają sceny, pokazują/ukrywają źródła i przełączają filtry w OBS — na żywo.

## Jak działa
- **Reguły** (zdarzenie → akcja) definiujesz w `/admin#obsrules` (sekcja „Sterowanie OBS", #664–665).
- **Aktuator** to headless browser-source `/overlay/obs-control?token=<OVERLAY_TOKEN>` (#672), który **dodajesz w OBS, na tej samej maszynie co OBS**. Łączy się z lokalnym OBS WebSocket (`obs-websocket-js`), nasłuchuje alertów (`/api/alerts/queue`) i wykonuje reguły (`lib/obs-rules` → `obsActionsForAlert`) z opcjonalnym auto-revertem.
- **Architektura:** kontroler działa po stronie klienta (przeglądarka wbudowana w OBS), więc dosięga `ws://localhost:4455` **bez wystawiania OBS do internetu** — zero problemu sieciowego VPS↔streamer.

## Konfiguracja (jednorazowo)
1. **W OBS:** `Narzędzia → ustawienia WebSocket Server` → zaznacz **Enable WebSocket server**, zanotuj **port** (domyślnie `4455`) i ustaw/zanotuj **hasło**.
2. **W portalu `/admin#integrations`:** wpisz **OBS WebSocket URL** = `ws://localhost:4455` (lub Twój port) i **hasło** z kroku 1. Hasło jest szyfrowane at-rest (AES-256-GCM).
3. **W portalu `/admin#obsrules`:** dodaj reguły, np. *donation ≥ 50 → przełącz scenę „HYPE", cofnij po 5 s*.
4. **W OBS dodaj Źródło przeglądarki (Browser Source):** URL = `https://<twoja-domena>/overlay/obs-control?token=<OVERLAY_TOKEN>` (token z `/admin#alerts`). Rozmiar dowolny — źródło pokazuje tylko mały panel statusu, który po konfiguracji możesz ukryć (oko w OBS).

## Weryfikacja
- Panel statusu pokaże **„Połączono z OBS"** (zielona kropka) + liczbę aktywnych reguł.
- Odpal testowy alert: `/admin#alerts` → „Testuj alert" (typ np. `donation`) i sprawdź, czy scena/źródło/filtr reaguje; „ostatnia akcja" w panelu się zaktualizuje.
- Diagnostyka statusów: **„Brak adresu OBS WebSocket"** → uzupełnij krok 2 · **„Nieprawidłowy token"** → sprawdź `OVERLAY_TOKEN` · **„Błąd OBS"** → sprawdź czy WebSocket w OBS jest włączony i czy hasło się zgadza.

## Obsługiwane akcje (mapowane na protokół OBS WebSocket v5)
| Akcja | Co robi | Request OBS |
|---|---|---|
| `switch_scene` | przełącza scenę programową | `SetCurrentProgramScene` |
| `toggle_source` | pokaż/ukryj źródło w scenie | `GetSceneItemId` + `SetSceneItemEnabled` |
| `toggle_filter` | włącz/wyłącz filtr źródła | `SetSourceFilterEnabled` |
| `set_filter_intensity` | ustaw **siłę** filtra (1–5 → zakres liczbowy) | `SetSourceFilterSettings` (+ `SetSourceFilterEnabled`) |

Każda z opcjonalnym **auto-revertem** (`revertAfterMs`, 0.1–10 s) — np. błyśnij sceną na 5 s i wróć.

### Siła efektu — `set_filter_intensity` (#806)
Pierwsza akcja z **wielkością**, a nie z włącz/wyłącz. Wcześniej filtr dawało się tylko zapalić albo
zgasić, więc wylosowane „nasilenie" nie miało jak dojść do OBS.

Nazwę ustawienia i jego zakres podaje **streamer** (np. `Filter.Blur.Size`, 1–40), bo te klucze należą
do konkretnej wtyczki filtra i nie wolno ich zgadywać. Nasilenie 1–5 jest **liniowo** mapowane na ten
zakres, z trafieniem w oba końce dokładnie (kto ustawi 1–40, przy maksimum dostaje 40, nie 39,2).
**Odwrócony zakres jest wspierany** (`min > max`) — w części ustawień mniejsza liczba to mocniejszy
efekt. Filtr jest przy okazji **włączany**, bo ustawiona siła przy zgaszonym filtrze nic nie robi, a
przywrotka odtwarza **cały** obiekt ustawień, nie samo jedno pole.

⚠️ **Ta akcja NIE jest zapisywalna jako `ObsRule`** — model nie ma kolumn na nazwę ustawienia ani
zakres, więc `validateObsAction` ją odrzuca (osobny `validateIntensityAction` obsługuje formularz kar).
Powstaje w momencie losowania kary i leci prosto do aktuatora. `toggle_filter` i `set_filter_intensity`
na tym samym filtrze dzielą **jeden cel przywrotki**, więc ich reverty się zwijają, a nie biją.

### Nakładające się efekty — jedna przywrotka na cel (#806)
Dwa efekty z revertem na **tym samym celu** (ta sama para źródło+filtr, ten sam element sceny, albo dwie zmiany scen — OBS ma jedną scenę programową, więc te kolidują **zawsze**) nie psują się już wzajemnie. Zasada: **pierwszy efekt zapisuje stan bazowy, kolejne tylko przesuwają termin**, a na cel przypada dokładnie jedna zaplanowana przywrotka.

Dwa błędy, które to naprawia — utajone przy rzadkich, deterministycznych regułach, ale rutynowe przy modułe kar, gdzie wiele losowych efektów nachodzi na siebie z założenia:
- **przywrotka przywracała zły stan, trwale.** „Poprzednia" scena była odczytywana w momencie akcji, więc druga zmiana scen w trakcie zaległej przywrotki zapisywała jako bazową **scenę pierwszego efektu** — jej revert przełączał stream na scenę kary i tam zostawiał;
- **timery nadpisywały się i nie dawały się anulować.** Blur na 30 s i blur na 5 s: revert krótszego gasił filtr po 5 s, a revert dłuższego **włączał go ponownie** po 30 s i nie miał go już co zgasić.

Dodatkowo stan bazowy jest teraz **odczytywany z OBS**, a nie zakładany jako przeciwieństwo docelowego: revert źródła, które i tak było ukryte, wcześniej by je **pokazał**. A zamknięcie lub odświeżenie źródła przeglądarkowego **przywraca wszystko, co zostało zaległe**, zamiast zostawiać scenę w połowie efektu.

Logika decyzyjna jest czysta i otestowana w `lib/obs-revert.ts` (11 testów); komponent w OBS trzyma tylko timery i wywołania OBS.

## Bezpieczeństwo
Hasło OBS jest Twoje, lokalne, i trafia **wyłącznie do posiadacza overlay-tokena**, konsumowane na Twojej maszynie (źródło w OBS). Trasy `/overlay/*` i `/api/obs-control/config` są `noindex` / `no-store`. **Rotacja tokena** w `/admin#alerts` unieważnia stare URL-e źródeł. Aktuator jest **dormant** dopóki nie dodasz źródła i nie ustawisz creds — zero wpływu na resztę portalu.

## Ograniczenie (v1)
Aktuator czyta ten sam feed co overlay alertów, więc respektuje **progi wyświetlania per-typ** (`AlertTypeConfig.minAmount`): alert ukryty przed overlayem (np. mały donejt) nie dotrze też do aktuatora. Próg specyficzny dla OBS ustawiasz w samej regule (`minAmount`). Dedykowany, niefiltrowany feed = ewentualny follow-up.

---

## 🎚️ Stream Deck / Bitfocus Companion — wyzwalanie alertów z pulpitu

Fizyczny **Stream Deck** przełącza sceny/źródła OBS sam, przez `obs-websocket` (natywna wtyczka Elgato „OBS Studio") — to nie dotyka platformy. Żeby przycisk **odpalał alerty/overlaye portalu**, potrzebne jest wywołanie HTTP do platformy. Cały panel admina jest za ciasteczkiem sesji (przeglądarka), którego macropad nie utrzyma — dlatego jest jedna, wąska, token-authed furtka: `POST /api/streamdeck/trigger`.

**Dlaczego osobny token (nie `botSecret`):** `botSecret` daje dostęp do ekonomii (mennica waluty, tożsamości, kasyno). Token Stream Decka umie **wyłącznie** wrzucić alert na overlay — zero ekonomii, zero admina. Weryfikacja (`verifyStreamDeckTokenForTenant`) **nie ma globalnego master-key**: tylko własny token portalu autoryzuje, portal bez tokenu nie da się wyzwolić w ogóle. Wyciek tokenu z pulpitu = co najwyżej spam alertów na własnym overlayu.

### Konfiguracja (jednorazowo)
1. **Panel admina → Stream Alerts → „Token Stream Deck"** (albo `POST /api/admin/streamdeck-token {action:"rotate"}`) → skopiuj token — **pokazywany dokładnie raz**.
2. W **Bitfocus Companion** (lub BarRaider „API Ninja"/„Advanced Launcher") dodaj przyciskowi akcję **HTTP POST**:
   - URL: `https://<twoj-portal>/api/streamdeck/trigger`
   - Nagłówek: `Authorization: Bearer <TOKEN>` (w Companion trzymaj token w zmiennej, nie w każdym przycisku)
   - Content-Type: `application/json`
3. Body per przycisk:

| Przycisk | Body |
|---|---|
| Test alert | `{"action":"test"}` |
| Odpal zapisany Custom Alert | `{"action":"custom_fire","id":"<CUSTOM_ALERT_ID>"}` (id z panelu Custom Alerts) |

> **Uwaga (`test`):** typ `test` musi być włączony w Stream Alerts, inaczej `dispatchAlert` po cichu go pomija — endpoint zwraca wtedy `{ok:true, dropped:true}`, więc feedback w Companion odróżni „wysłano" od „wyciszone ustawieniami". `custom_fire` (`type:"custom"`) omija ten filtr — zawsze się pokaże.

### Rozszerzalność
Switch endpointu jest celowo mały (v1 = domena alertów, zero mutacji ekonomii). Kolejny slice doda na **tym samym tokenie** akcje ekonomii/eventów: `drop` (drop GT), `draw` (losowanie eventu), `goal_reset` (reset celu), `subathon_*`, `song_next`, `trivia_golive`, `clip`. Rotacja/wyczyszczenie tokenu: `POST /api/admin/streamdeck-token {action:"clear"|"rotate"}`.
