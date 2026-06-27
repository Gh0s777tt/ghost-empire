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

## Bezpieczeństwo
Hasło OBS jest Twoje, lokalne, i trafia **wyłącznie do posiadacza overlay-tokena**, konsumowane na Twojej maszynie (źródło w OBS). Trasy `/overlay/*` i `/api/obs-control/config` są `noindex` / `no-store`. **Rotacja tokena** w `/admin#alerts` unieważnia stare URL-e źródeł. Aktuator jest **dormant** dopóki nie dodasz źródła i nie ustawisz creds — zero wpływu na resztę portalu.

## Ograniczenie (v1)
Aktuator czyta ten sam feed co overlay alertów, więc respektuje **progi wyświetlania per-typ** (`AlertTypeConfig.minAmount`): alert ukryty przed overlayem (np. mały donejt) nie dotrze też do aktuatora. Próg specyficzny dla OBS ustawiasz w samej regule (`minAmount`). Dedykowany, niefiltrowany feed = ewentualny follow-up.
