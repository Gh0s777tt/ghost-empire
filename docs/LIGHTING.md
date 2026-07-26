# 💡 LIGHTING.md — Govee smart-light flash (dormant until configured)

Your stream light reacts to events: a donation / sub / cheer changes a colour, brightness or turns it on/off. Off by default.

## Two ways to configure (#720–#724)
- **Per-portal, via the admin panel (recommended, multi-tenant):** in **`/admin#integrations`** enter your **Govee API key + device ID + model** (stored encrypted, per portal). Then in **`/admin#goverules`** ("Govee lighting") add rules: *when `<alert>` (and ≥ amount) → `set color` / `set brightness` / `turn on-off`* (with an optional flash→revert window). The server actuator (`lib/govee.ts`) runs them on each alert. Pure rule logic + validation: `lib/govee-rules.ts`.
- **Env-based (founder v1 / fallback, #678):** set the `GOVEE_*` vars below. Used only when a portal has **no** per-tenant creds+rules — i.e. the founder's original flash setup keeps working unchanged.

## How it works
Govee's **cloud** Developer API → the portal calls it server-side from the alert dispatch (no local bridge, unlike OBS WebSocket). On a matching alert the light is set to the flash colour, then optionally reverts to a resting colour.

## Get your Govee key + device
1. In the **Govee Home** app → Profile → **Apply for API Key** (arrives by email).
2. List your devices to find the one to drive:
   `curl -H "Govee-API-Key: <key>" https://developer-api.govee.com/v1/devices`
   → note that light's **`device`** (MAC) and **`model`**.

## Enable (Vercel → Settings → Environment Variables)
| Var | Example | |
|---|---|---|
| `GOVEE_API_KEY` | … | your Govee Developer API key |
| `GOVEE_DEVICE_ID` | `AB:CD:EF:…` | the device MAC from the list call |
| `GOVEE_DEVICE_MODEL` | `H6159` | the device model |
| `GOVEE_FLASH_TYPES` | `donation,twitch_sub,twitch_gift_sub,twitch_cheer` (default) | which alert types flash |
| `GOVEE_FLASH_COLOR` | `#E50914` (default) | flash colour (hex) |
| `GOVEE_REST_COLOR` | `#FFAA55` | colour to revert to after the flash (unset → light holds the flash colour) |
| `GOVEE_FLASH_MS` | `4000` (default) | revert delay in ms (only with `GOVEE_REST_COLOR`) |
| `GOVEE_MIN_AMOUNT` | `50` | only flash when the alert amount ≥ this (optional) |

## Verify
Set the env, redeploy, then fire a test alert: `/admin#alerts` → "Testuj alert" → `donation`. The light should flash (and revert if `GOVEE_REST_COLOR` is set).

## Notes & limits (v1)
- **v1 is env-configured: one device, founder-scoped.** Per-tenant config + per-event colour **rules** + an admin UI is a clean follow-up that would mirror the OBS-control feature (`lib/obs-rules` + `/admin#obsrules`).
- **Philips Hue** is a *local* bridge (like OBS WebSocket), so it needs the in-OBS/local-bridge approach — a separate add-on, not this cloud path.
- The revert is best-effort: serverless can freeze the function after the response, so a short flash window is most reliable. Without `GOVEE_REST_COLOR` the light simply holds the last event's colour.

## Philips Hue (#813)

Obok Govee. **Reguły mają ten sam kształt** (`triggerType` + opcjonalny `minAmount` → akcja
`set_color` / `set_brightness` / `turn` z opcjonalnym auto-powrotem), więc panel i sposób myślenia są
identyczne — różni się wyłącznie transport i dwie jednostki.

### Dlaczego Hue jest sterowane inaczej niż Govee
Govee to **API chmurowe**, więc portal wysyła komendy z serwera. **Mostek Hue stoi w Twojej sieci
lokalnej** (`hueBridgeIp`, np. `192.168.1.50`) i żadna funkcja serverless do adresu prywatnego nie
dojdzie. Dlatego światłami steruje **źródło przeglądarkowe w OBS** — jedyna rzecz, którą portal
uruchamia na Twojej maszynie. Poświadczenia mostka jadą tym samym kanałem co hasło do OBS
WebSocket: za tokenem overlaya, `no-store`, zużywane lokalnie.

Efekt uboczny jest korzystny: błyśnięcie światłem **dziedziczy księgę przywrotek** z
`lib/obs-revert.ts`. Czerwony błysk na 30 s i niebieski na 5 s na tej samej lampie **nie zostawią jej
czerwonej** — pierwszy efekt zapisuje stan bazowy, kolejne tylko przesuwają termin. Dwie różne lampy
działają niezależnie, a reguła „wszystkie światła" ma własny cel, bo koliduje z każdą inną taką.

### Dwie jednostki, w których Hue nie jest Govee
| | Govee | Hue |
|---|---|---|
| Jasność | procent 0–100 | **1–254** w mostku (`0` jest **poza zakresem** i nie znaczy „zgaszone") |
| Kolor | RGB | **CIE xy** — mostek nie przyjmuje RGB |

W panelu konfigurujesz **procent i hex**, tak jak w Govee. Konwersja siedzi na krawędzi
(`briFromPercent`, `hexToXy`) i jest otestowana, bo zła macierz kolorów **nie failuje głośno** —
po cichu świeci nie tym kolorem. Czysta czerń jest odrzucana: światło nie może być czarne, może być
zgaszone (`turn`).

### Konfiguracja
1. `/admin#integrations` → karta **Philips Hue**. Oba pola są **per portal** — każdy streamer wpisuje
   swoje, nic nie jest zahardkodowane, klucz zapisywany **zaszyfrowany**.
   * **IP mostka** — przycisk „Wykryj mostek w sieci" wypełnia je sam. Odpytuje publiczną usługę
     Philipsa, która zwraca mostki widziane **z publicznego IP dzwoniącego**, dlatego woła ją
     **przeglądarka streamera, nie serwer** — z Vercela odpowiedź dotyczyłaby sieci Vercela i nie
     znalazłaby nic. Usługa jest po https, więc panel może ją wołać bez treści mieszanej.
   * **Klucz API** — tego **nie da się** pobrać z panelu: wymaga zwykłego `http` do adresu w LAN, co
     przeglądarka blokuje na stronie https. Dlatego karta rozwija instrukcję: naciśnij przycisk na
     mostku i w ciągu 30 s uruchom jedno polecenie `curl` (z już wstawionym IP), a z odpowiedzi
     wklej `username`. Bez instalowania czegokolwiek, na każdym systemie.
2. Reguły — sekcja panelu w kolejnej porcji; do tego czasu wiersze `hue_rules` zakłada się przez API.
3. Źródło **sterowania OBS** musi być dodane w OBS (to samo, które obsługuje reguły scen).

⚠️ Hue jest **uśpione**, dopóki nie ma **obu** poświadczeń — portal celowo nie wysyła połowicznej
konfiguracji, żeby kontroler nie próbował odpytywać LAN-u, którego nie zna.
