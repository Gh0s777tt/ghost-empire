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

Każda z opcjonalnym **auto-revertem** (`revertAfterMs`, 0.1–10 s) — np. błyśnij sceną na 5 s i wróć.

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
