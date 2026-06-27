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
