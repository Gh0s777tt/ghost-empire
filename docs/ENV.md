# 🔑 ENV.md — zmienne środowiskowe (kompletny spis)

Pełna lista zmiennych środowiskowych w całym ekosystemie Ghost Empire. To **referencja** — `.env.example` w każdym pakiecie bywa niepełny; tu jest stan z kodu.

> **Bezpieczeństwo:** sekrety wrzucasz **sam** — portal: Vercel → Project → Settings → Environment Variables; boty: gitignored `.env`. Nigdy nie wklejaj kluczy na czacie / do repo. Cokolwiek przeciekło — **zrotuj**.

Legenda: **R** = wymagane do działania rdzenia · **O** = opcjonalne / dla konkretnej funkcji.

---

## 1. `ghost-empire-web` (portal, Vercel)

### Rdzeń (R)
| Zmienna | Po co | Skąd |
|---|---|---|
| `NEXTAUTH_SECRET` | Podpis sesji. Auth.js v5 czyta `AUTH_SECRET`, a gdy brak — `NEXTAUTH_SECRET`; **zostaw bez zmian** (z niego liczony jest też klucz szyfrowania `crypto.ts`, jeśli nie ma `ENCRYPTION_KEY`). | `openssl rand -base64 32` |
| `NEXTAUTH_URL` / `AUTH_URL` | ⚠️ **Przy WIELU portalach (własne domeny/subdomeny) ZOSTAW NIEUSTAWIONE.** Gdy ustawione, Auth.js przypina WSZYSTKIE callbacki OAuth do tej jednej domeny — więc logowanie zaczęte na `empire-forge.com` wraca na nią → ciasteczka `state`/PKCE nie pasują (są na domenie startowej) → logowanie pada wszędzie poza portalem głównym (#659). Z `trustHost: true` (ustawione w `auth.ts`) Auth.js sam wyprowadza callback z hosta żądania → każdy portal loguje na swojej domenie i jako swój tenant. Pozostałe użycia (sitemap/robots/admin streamer-auth/webhooki/passkeys) mają twardy fallback do `https://ghost-empire-web.vercel.app`, więc brak tej zmiennej ich nie psuje. **Ustaw tylko dla deploymentu single-domain.** | (puste przy multi-portal) |
| `DATABASE_URL` | Postgres (Supabase, **transaction pooler 6543**, `connection_limit=3`) | Supabase → Database → Connection string |
| `DIRECT_URL` | Postgres bezpośredni (port 5432) — migracje / `db push` | Supabase (Session) |
| `BOT_SECRET` | Bearer dla `/api/internal/*` i `/api/bot/*` — **ten sam** w obu botach | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` (O) | Klucz do szyfrowania sekretów at-rest (AES-256-GCM): klucze API + tokeny OAuth w bazie. **Opcjonalny** — gdy brak, używany jest `NEXTAUTH_SECRET`. W prod warto ustawić dedykowany, by odpiąć szyfrowanie od auth. ⚠️ Po zmianie klucza stare zaszyfrowane wartości stają się nieczytelne (klucze API → wklej ponownie w `/admin#integrations`, tokeny → ponowna autoryzacja). | `openssl rand -hex 32` |

### Logowanie (OAuth) — R dla danego dostawcy
| Zmienna | Dostawca | Skąd |
|---|---|---|
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | Twitch login + API | dev.twitch.tv/console |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Discord login | discord.com/developers |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google → YouTube login + YT API | console.cloud.google.com |
| `KICK_CLIENT_ID` / `KICK_CLIENT_SECRET` | Kick login + API | dev.kick.com |

> **⚠️ Błąd `OAuthCallback` przy logowaniu (np. Twitch)** — dostawca **przekierował z powrotem, ale odrzucił callback**. To zawsze konfiguracja, nie kod. Sprawdź po kolei:
>
> 1. **Redirect URI w konsoli dewelopera** musi być **DOKŁADNIE** (znak w znak, `https`, bez ukośnika na końcu):
>    - Twitch (dev.twitch.tv/console → Twoja aplikacja → *OAuth Redirect URLs*): `https://<twoja-domena>/api/auth/callback/twitch`
>    - analogicznie `…/api/auth/callback/kick`, `…/discord`, `…/google`.
>    - Jeśli używasz domeny `*.vercel.app` **i** własnej domeny — dodaj **oba** URI.
> 2. **`NEXTAUTH_URL` w Vercel** = ta sama domena, pod którą realnie wchodzisz (np. `https://ghost-empire-web.vercel.app`), **bez** `/` na końcu. Jeśli się różni, `redirect_uri` w wymianie tokenu nie zgodzi się z tym z konsoli → `OAuthCallback`.
> 3. **`TWITCH_CLIENT_SECRET`** aktualny (po „New Secret" w konsoli stary natychmiast przestaje działać — zaktualizuj w Vercel i **zrób redeploy**).
> 4. Po zmianie env w Vercel **redeploy** (env wczytuje się przy buildzie).
>
> Ekran `/auth/signin` przy tym błędzie **sam wypisuje dokładny Redirect URI do skopiowania** (liczony z aktualnej domeny) + przypomina o `NEXTAUTH_URL`.

### Admin / role
| Zmienna | Po co |
|---|---|
| `ADMIN_DISCORD_ID` (O) | Discord ID, który dostaje admina przy logowaniu Discordem |
| `ADMIN_EMAILS` (O) | Dodatkowe maile = stały admin, po przecinku. (Email właściciela jest **hardcodowany** w `auth.ts`, więc działa bez tego.) |

### Integracje strumieniowe (O — wg potrzeb)
| Zmienna | Po co |
|---|---|
| `TWITCH_EVENTSUB_SECRET` | Weryfikacja podpisu webhooków Twitch EventSub (suby/gifty/bity) |
| `STREAMLABS_CLIENT_ID` / `STREAMLABS_CLIENT_SECRET` | OAuth Streamlabs (donacje) |
| `DONATION_GT_PER_PLN` | Ile GT za 1 PLN donacji (default w kodzie) |
| `PAYMEDIA_WEBHOOK_SECRET` / `PAYMEDIA_GT_PER_PLN` | Webhook dostawcy płatności PayMedia (alternatywa donacji) |
| `OVERLAY_TOKEN` | **Legacy/fallback** — token overlayów OBS. Domyślnie token jest auto-generowany w bazie i widoczny/rotowalny w `/admin#alerts`; ten env nie jest potrzebny |
| `AI_API_KEY` / `AI_PROVIDER` / `AI_MODEL` (O) | Klucz AI + dostawca (`openai`/`anthropic`/`grok`/`gemini`/`deepseek`/`bielik`) + model — fallback dla `/admin#integrations`. Ustawione w Vercelu (OpenAI · `gpt-4o-mini`) |
| `STEAM_API_KEY` (O) | Steam Web API key (biblioteka gier `/games`). Z [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey). Ustawione w Vercelu |
| `STEAM_ID` (O) | SteamID64 dla skryptu `scripts/sync-steam.ts` (ręczny sync biblioteki). Produkcyjnie Steam ID jest per-portal w `GameLibraryConfig`, nie tu |
| `RUMBLE_API_URL` (O) | Pełny URL Rumble Livestream API (z kluczem) — overlay `/overlay/rumble`. Ustawione w Vercelu |
| `GOVEE_*` (O) | **Dormant** oświetlenie Govee — lampka reaguje na eventy (donejt/sub/cheer). Ustaw `GOVEE_API_KEY` + `GOVEE_DEVICE_ID` (MAC) + `GOVEE_DEVICE_MODEL`; opcj. `GOVEE_FLASH_TYPES` / `GOVEE_FLASH_COLOR` / `GOVEE_FLASH_MS` / `GOVEE_REST_COLOR` / `GOVEE_MIN_AMOUNT`. Bez nich no-op. v1 env-based (founder-scoped). Patrz [docs/LIGHTING.md](LIGHTING.md) |
| `PSN_NPSSO` (O) | **Globalny fallback** dla biblioteki gier PSN. Z `ca.account.sony.com/api/v1/ssocookie`. **Wygasa ~60 dni.** Od #626 każdy portal może ustawić **własny** NPSSO w `/admin#games` (`GameLibraryConfig.psnNpsso`, szyfrowany at-rest) — ten env to już tylko fallback, gdy portal nie ma własnego |
| `CRON_SECRET` | Bearer chroniący crony Vercel: `/api/cron/streamlabs-poll` (polling donacji), `/api/cron/prune` (czyszczenie starych rekordów), `/api/cron/weekly-rewards` (poniedziałki 00:00 — nagrody rankingu tygodnia per portal) i `/api/cron/backup` (05:00 — off-site backup) |
| `BACKUP_S3_*` (O) | **Dormant** off-site backup (cron 05:00 → bucket S3-compatible: Cloudflare R2 / Backblaze B2 / AWS S3). Ustaw `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` (+ opcj. `BACKUP_S3_REGION`, domyślnie `auto` dla R2). Bez nich cron zwraca `{skipped:true}`. Patrz [docs/BACKUP.md](BACKUP.md) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (O) | Upstash Redis (REST) — współdzielony cache między instancjami serverless (np. feed viewer-count). Bez nich cache spada na in-memory per-instancja. Z [upstash.com](https://upstash.com) → Redis → sekcja REST API |
| `NEXT_PUBLIC_SITE_URL` (O) | Publiczny bazowy URL strony (linki absolutne / OG / share). Gdy brak — fallback do `NEXTAUTH_URL`. `NEXT_PUBLIC_` = widoczny w przeglądarce, **nie wkładaj tu sekretów** |
| `LOG_LEVEL` (O) | Poziom structured loggera (`debug`/`info`/`warn`/`error`; `lib/logger.ts`). Domyślnie `info` na prod, `debug` na dev |
| `NODE_ENV` | Ustawiane przez platformę (`production`/`development`) — nie ustawiasz ręcznie |

### Web Push / powiadomienia (O — funkcja uśpiona bez kluczy)
> Powiadomienia web push (#533) są **uśpione**, dopóki nie ustawisz pary kluczy VAPID **i** nie zrobisz `prisma db push` (tabela `push_subscriptions`). Bez tego przełącznik „Powiadomienia" na `/profile` po prostu się nie pokazuje, a wysyłki są no-opem. Klucze generujesz raz: `npx web-push generate-vapid-keys` (pakiet `web-push` jest już zależnością) — da `Public Key` i `Private Key`.

| Zmienna | Po co |
|---|---|
| `VAPID_PUBLIC_KEY` | Publiczny klucz VAPID — serwowany klientowi przez `GET /api/push/vapid` (czytany w runtime, więc aktywacja nie wymaga rebuildu). Z natury publiczny |
| `VAPID_PRIVATE_KEY` | Prywatny klucz VAPID — podpisuje wysyłki po stronie serwera. **Sekret** — tylko w Vercel env |
| `VAPID_SUBJECT` (O) | Kontakt wymagany przez push services — `mailto:ty@domena` lub URL. Domyślnie `mailto:admin@ghost-empire.app` |

### SaaS multi-tenant + billing (O — dopóki nie uruchamiasz white-label/płatności)
> Cały moduł SaaS jest **dry-wired**: bez tych zmiennych portal działa jak pojedynczy tenant (founder = plan `elite` bezterminowo), subdomeny są no-opem, a checkout zwraca 503 (trial bez karty). Ustawienie ich „włącza" multi-tenant i Stripe **bez zmian w kodzie**.

| Zmienna | Po co | Wymagana? |
|---|---|---|
| `NEXT_PUBLIC_ROOT_DOMAIN` | Domena bazowa dla subdomen tenantów (np. `myapp.com`) — z `<slug>.myapp.com` proxy wyłuskuje slug tenanta (`lib/tenant-host.ts`). Gdy brak — resolwer slugu jest no-opem (wszystko → tenant domyślny). `NEXT_PUBLIC_` = widoczne w kliencie | O — wymagana do subdomen per tenant |
| `STRIPE_SECRET_KEY` | Klucz Stripe (`sk_live_…`/`sk_test_…`) — `billingConfigured()` i klient Stripe. Bez niego billing OFF (checkout → 503) | O — wymagana, by włączyć płatności |
| `STRIPE_WEBHOOK_SECRET` | Sekret podpisu webhooka Stripe (`whsec_…`) dla `POST /api/webhooks/stripe` — weryfikacja zdarzeń subskrypcji (aktywacja/odnowienie/wygaśnięcie) | O — wymagana z włączonym billingiem |
| `STRIPE_PRICE_<PLAN>_<MIESIĄCE>M` | 12 Stripe price-id wg wzorca `STRIPE_PRICE_{PRO\|ELITE\|BASIC}_{1\|3\|6\|12}M` (np. `STRIPE_PRICE_PRO_3M=price_123`). Mapuje plan+okres na cenę; nieustawiona kombinacja po prostu nie jest oferowana | O — ustaw te kombinacje, które sprzedajesz |

---

## 2. `ghost-empire-chat` (bot czatu Twitch/Kick/YouTube)

| Zmienna | Po co |
|---|---|
| `PORTAL_URL` (R) | URL portalu (API ekonomii) |
| `BOT_SECRET` (R) | **Ten sam** co w portalu |
| `TWITCH_BOT_USERNAME` / `TWITCH_CHANNEL` / `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` / `TWITCH_BOT_OAUTH` | Bot Twitch (`TWITCH_BOT_OAUTH` ← `npm run auth:twitch`) |
| `KICK_CHANNEL` / `KICK_CHATROOM_ID` / `KICK_BROADCASTER_ID` / `KICK_CLIENT_ID` / `KICK_CLIENT_SECRET` / `KICK_BOT_TOKEN` / `KICK_BOT_REFRESH` | Bot Kick (`KICK_BOT_*` ← `npm run auth:kick`, refresh rotowany do `.kick-tokens.json`) |
| `KICK_PUSHER_KEY` (O) | Nadpisanie publicznego klucza Pushera Kicka, gdyby się zmienił |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `YOUTUBE_BOT_REFRESH_TOKEN` | Bot YouTube (Option C — autoryzacja konta kanału, `npm run auth:youtube`) |
| `KICK_TOKEN_STORE` (O) | Ścieżka pliku tokenów Kicka — ustaw na zamontowany wolumen, by refresh przeżył redeploy (Docker 24/7) |

---

## 3. Bot Discord — **E-Bot** (osobne repo `Gh0s777tt/E-Bot`)

> ⚠️ Dawny `ghost-empire-bot` jest **zastąpiony (deprecated)**. Discordem zajmuje się **E-Bot** — używa własnego pliku `.env` (w swoim repo) i **prefiksowanych `GHOST_*`** zmiennych, by nie kolidować z resztą E-Bota. Ekonomia jest **opt-in** (domyślnie OFF).

| Zmienna (E-Bot) | Po co |
|---|---|
| `DISCORD_BOT_TOKEN` (R) | Token bota Discord |
| `GHOST_ECONOMY` (R) | `1`/`true` włącza ekonomię GT + privileged intents. Bez tego E-Bot działa jak dotąd (bez naliczania) |
| `GHOST_BOT_SECRET` (R) | **Ten sam** co `BOT_SECRET` w portalu (bearer do `/api/internal/*`) |
| `GHOST_API_URL` (O) | URL portalu (domyślnie `https://ghost-empire-web.vercel.app`) |
| `DISCORD_GUILD_ID` (O) | Zawęża naliczanie do jednego serwera |
| `GHOST_MESSAGE_REWARD` / `GHOST_MESSAGE_COOLDOWN_SECONDS` / `GHOST_VOICE_REWARD_PER_MINUTE` / `GHOST_VOICE_TICK_SECONDS` / `GHOST_AFK_GIVES_REWARD` / `GHOST_MUTED_GIVES_REWARD` (O) | Strojenie nagród (defaulty pollowane z `/api/bot/config`, czyli z `/admin#bot`; env nadpisuje) |

> Dodatkowo w Discord Dev Portal apki E-Bota włącz **Message Content** + **Server Members** (privileged intents) — bez tego bot z `GHOST_ECONOMY=1` nie zaloguje się. Po zmianie: `cd bot && npm run deploy` (rejestruje `/portal`) + restart.

---

## 4. Czego potrzebujesz pod funkcje „creds-gated" z ROADMAP

> 🆕 **Klucze funkcyjne wklejasz teraz NA STRONIE** w `/admin#integrations` (zapis w bazie `IntegrationConfig`, admin-only, maskowane) — przeżywają zmianę komputera. **Wartość z bazy nadpisuje env.** Dotyczy: **klucz AI** (+ dostawca + model), **Sentry DSN**, **OBS WebSocket** (adres + hasło). Można też nadal użyć env jako fallbacku (`AI_API_KEY`, `SENTRY_DSN`).
>
> 🔒 **Sekrety infrastruktury ZOSTAJĄ w env** (nie w bazie — bootstrap/bezpieczeństwo): `DATABASE_URL`, `NEXTAUTH_SECRET`, klucze logowania OAuth (Twitch/Kick/Discord/Google), `BOT_SECRET`, `TWITCH_EVENTSUB_SECRET`.

| Funkcja | Jak podać |
|---|---|
| **AI** (postać `@bot` + `!imagine`) | `/admin#integrations` → dostawca (Anthropic/OpenAI/Grok/Gemini/DeepSeek/Bielik) + klucz + opcjonalny model. *(env fallback: `AI_API_KEY`)* |
| **Sentry** (monitoring) | ⚠️ **SDK inicjuje się przy starcie z `SENTRY_DSN` w env Vercela** (`instrumentation.ts`), nie z bazy — ustaw env, by aktywować error-tracking. Pole DSN w `/admin#integrations` służy innym ścieżkom runtime. Bez `SENTRY_DSN` Sentry jest no-op. |
| **OBS WebSocket** | `/admin#integrations` → adres `ws://…` + hasło z OBS |
| **Social Linki OAuth** (Instagram / TikTok / Facebook / X) | Aplikacja deweloperska u dostawcy → `*_CLIENT_ID` / `*_CLIENT_SECRET` + redirect URI (env) |
| **Philips Hue / Govee** | Konto/most deweloperski + token API |

---

## 5. Rotacja sekretów (runbook)

Gdy sekret wycieknie lub planowo go zmieniasz — kolejność i skutki:

| Sekret | Jak zrotować | Skutek / co zrobić po |
|---|---|---|
| `BOT_SECRET` | Wygeneruj nowy (`openssl rand -hex 32`), ustaw **ten sam** w Vercel **oraz** w obu botach (`.env`), redeploy + restart botów | Do czasu zsynchronizowania `/api/internal/*` i `/api/bot/*` zwracają 401 — rób w jednym oknie czasowym |
| `NEXTAUTH_SECRET` | Nowy (`openssl rand -base64 32`) w Vercel, redeploy | **Wylogowuje wszystkich** (sesje podpisane starym). ⚠️ Jeśli **nie** masz `ENCRYPTION_KEY`, to ten sekret szyfruje też sekrety at-rest → po zmianie **klucze API trzeba wkleić ponownie** w `/admin#integrations`, a tokeny OAuth/streamer **ponownie autoryzować**. Dlatego w prod ustaw osobny `ENCRYPTION_KEY`. |
| `ENCRYPTION_KEY` | Nowy w Vercel, redeploy | Stare zaszyfrowane wartości stają się nieczytelne → wklej ponownie klucze API (`/admin#integrations`) i zrób re-auth streamera (Twitch/Kick/YouTube/Streamlabs). Logowanie userów **nietknięte**. |
| Klucze OAuth logowania (Twitch/Kick/Discord/Google `*_CLIENT_SECRET`) | „New secret" w konsoli dostawcy → zaktualizuj w Vercel → **redeploy** | Stary sekret przestaje działać natychmiast → bez redeployu logowanie pada (`OAuthCallback`) |
| `TWITCH_EVENTSUB_SECRET` | Nowy w Vercel → **odtwórz subskrypcje** w `/admin#twitch` (klik „Utwórz subskrypcje") | Webhooki podpisane starym sekretem będą odrzucane do odtworzenia subskrypcji |
| Tokeny botów (Twitch/Kick/YouTube refresh) | Ponowna autoryzacja: `npm run auth:twitch` / `auth:kick` / `auth:youtube` w `ghost-empire-chat` | Kick rotuje refresh-token sam (plik `.kick-tokens.json`) |
| Sekret webhooka wychodzącego (HMAC) | `/admin#webhooks` → edytuj webhook → wpisz nowy sekret | Zaktualizuj też weryfikację po stronie odbiorcy (Discord/n8n) |

> Sekrety at-rest (klucze API, tokeny OAuth) są szyfrowane AES-256-GCM (`lib/crypto.ts`). Zmiana czystej-tekstowej wartości na zaszyfrowaną dzieje się przy następnym zapisie (prefiks `enc:v1:`).
