# Plan aktualizacji E-Forge — sierpień 2026

Śledzony plan updatu zamówionego przez właściciela (kreator scen, widgety/alerty, branding,
integracje/donacje, song-request, koło za donaty, osiągnięcia, panel donacji) + diagnostyka +
dwa nowe projekty (rozszerzenie OBS, multistreaming). Zgodnie z regułą **„zero backlogów"** —
wszystko, czego nie dowozi slice 1, jest tu zapisane jako zaplanowane, nie porzucone.

Gałąź: `feat/eforge-update-2026-08` (odgałęziona od `fix/audit-2026-08`).

---

## 0. Werdykt bezpieczeństwa — routing donacji i platform (priorytet właściciela)

**Izolacja per-tenant TRZYMA.** Pieniądze nowego streamera nie trafiają na konta founder-a.
Zweryfikowane ścieżka po ścieżce (agent SEC-donation-routing):
- Jedna bramka `ingestDonation(event, tenantId)` (`src/lib/donations/ingest.ts`) — zapisuje
  `Donation.tenantId`, mintuje tylko przy `trust:"verified"`, waliduje `knownUserId` względem tenanta.
- Ko-fi/custom webhooki: tenant z **per-integration cuid w URL** + sekret constant-time. Nie z Hosta.
- Pollery DonationAlerts/Streamlabs/Tipply: **iterują integracje wszystkich tenantów**, kredytują
  każdy własny `tenantId` (naprawione — wcześniej pollowały tylko founder-a).
- Twitch/Kick EventSub: `broadcaster_user_id` → tenant przez unikalny wiersz tokenu.
- OAuth: **HMAC-podpisany `state {tenantId,userId}`** → callback nie podmieni tenanta.

**Dwie luki (medium) → SLICE 2:**
1. ✅ **ZROBIONE (slice 2).** Onboarding platform dla nie-foundera. Callbacki Twitch/Kick/YouTube/
   Streamlabs miały zaszyte `redirect_uri = NEXTAUTH_URL` + `requireAdmin` na hoście foundera, więc
   sub-tenant nie miał tam sesji. Wszystkie cztery przełączone na `requestOrigin(req)` (jak
   DonationAlerts i logowanie NextAuth) — callback wraca na host streamera, sesja obecna,
   `redirect_uri` byte-matchuje. **⚠️ Wymaga rejestracji callbacków w konsolach OAuth per host
   (WHITE-LABEL-SETUP.md §4) + testu na żywym OAuth przed mergem — nietestowalne w CI.**
2. ✅ **DYSPONOWANE (`docs/DECISIONS.md`).** PayMedia founder-global (`PAYMEDIA_WEBHOOK_SECRET`,
   `tenantId:null`). Zweryfikowane: **nie ma go w `PROVIDERS`**, żaden tenant nie skieruje tam
   wpłat → brak aktywnego wycieku; kredytuje wyłącznie foundera (kanał platformowy). Świadomie
   founder-global; white-label per-integration dopiero gdyby był oferowany tenantom. Effort (opc.): S/M.

---

## 1. Co dowozi SLICE 1 (ta gałąź, zweryfikowane, wypchnięte)

**Bugfixy z diagnostyki:**
- 🔒 **CSS-injection** — `safeMediaUrl` utwardzony: odrzuca metaznaki breakoutu (`" ) { }` \\ newline),
  zwraca zakodowany `href`; `bgImageUrl` w `layout.tsx` nie da się już wyłamać z `url("…")`.
- 🔒 **White-label leak w TTS** — lektor overlaya czyta nazwę waluty **tenanta** (z `/api/companion/
  branding`), nie zaszyte „Ghost Tokenów".
- 🔒 **Nieszyfrowany `<img src>`** avatara alertu → przez `safeMediaUrl`.
- ✅ D-3 (companion cross-tenant) — potwierdzone jako już zamknięte (#796), test odskipowany.

**Feature'y (bez uploadu i bez migracji):**
- 🎨 **Streamer ustawia własne tło portalu** — `bgImageUrl` wpięte w self-serve Appearance +
  `/api/onboarding/my` (6 presetów + własny URL, walidacja jak u platform-ownera).
- 🏆 **Osiągnięcia pogrupowane w kategorie**, zwijana lista (`<details>`), kategorie wyprowadzone z
  `triggerType` — bez migracji.
- 💸 **Panel donacji w Ekonomii** — kolejka rekonsyliacji odpięta od Streamlabs (Ko-fi/Tipply/custom
  też widzą) + nagłówek statystyk (`GET /api/admin/donations`: suma PLN / liczba / per-provider).
- 🎵 **SongRequest** — akcja **„next"** (domknij bieżącą + startuj następną jednym kliknięciem) +
  **`!unsr`/`!wrongsong`** (widz anuluje własną ostatnią prośbę na czacie, tylko swoją).
- 🧹 Poprawka mylącego komentarza GT-vs-CHIPS w `wheel.ts`.

---

## 2. Duże feature'y — roadmap (SLICE 2+)

### 2a. Wspólny enabler: **pipeline uploadu mediów** (BLOKER dla 3 obszarów)
✅ **FUNDAMENT ZROBIONY (slice 4, Supabase Storage — decyzja właściciela).** `lib/media-upload.ts`
(REST Storage przez fetch, bez zależności; magic-bytes allowlist, SVG wykluczony jako XSS, cap 20 MB,
per-tenant prefix `<tenantId>/<uuid>.<ext>`) + `POST /api/upload` (requireAdmin, rate-limit) +
reużywalny `MediaUploadButton`. **Pierwszy konsument: tło portalu** (przycisk „Wgraj plik" w Wyglądzie).
Zwraca publiczny URL → wpina się w istniejące pola URL (bgImageUrl/alerty/sceny) — **zero zmian schematu**.
- **⚠️ SETUP WŁAŚCICIELA (ENV.md):** `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + publiczny bucket
  (domyślnie `media`, Supabase → Storage → New bucket → Public). Bez tego `/api/upload` zwraca 503.
- **ZOSTAJE:** (a) **signed-URL** dla dużego WIDEO — Vercel Functions mają limit body ~4.5 MB, więc
  proxy `/api/upload` obsługuje obrazy; wideo/duże media → direct upload browser→Supabase (fast-follow);
  (b) wpięcie uploadu w **alerty** (§2c) i **sceny** (§2b). Effort resztki: **M**.

### 2b. Kreator Scen — własne sceny statyczne/animowane
✅ **WŁASNE OBRAZY W SCENACH ZROBIONE (slice 5).** Nowy typ elementu `image` (w tym samym JSON
`elements` → **zero migracji**): w edytorze przycisk „Wgraj plik" (upload z §2a) lub pole URL dodaje
grafikę jako element sceny; drag/resize jak widgety; render przez `<img>` (nie iframe), `src`
zsanityzowany przez `safeMediaUrl` po obu stronach (klient + serwer w `parseElements`). Daje **sceny
statyczne** na własnej grafice.
✅ **WIDEO/ANIMACJE W SCENACH ZROBIONE (gałąź `feat/scene-alert-video-2026-08`).** Nowy typ elementu
`video` (mp4/webm) w tym samym JSON `elements` (`widget:"video"`) → **zero migracji**: upload (`accept`
+ wykryty `kind`) lub URL (rozpoznanie po rozszerzeniu); render `<video>` autoplay/muted/loop w
`/overlay/scene/[id]`; `src` przez `safeMediaUrl` po obu stronach; podgląd wideo w kafelku edytora.
Duże pliki (>~4.5 MB) przez URL (upload proxy Vercela ma limit body — signed-URL to osobny fast-follow).
✅ **ŻYWY PODGLĄD + WŁĄCZ/WYŁĄCZ ZROBIONE (gałąź `fix/scene-builder-2026-08`).** Kafelki mogą renderować
prawdziwy widget (iframe jak w OBS, domyślnie off — 24 elementy × osobna strona z pollingiem);
`enabled` na elemencie (w tym samym JSON → **zero migracji**, brak pola = włączony) i `OverlayScene.enabled`
na całej scenie (**wymaga `prisma db push`**). Wyłączone elementy odsiewane SERWEROWO, więc nie kosztują CPU.
Naprawiony przy okazji defekt: poprawka nazwy sceny kasowała niezapisane elementy z płótna.
✅ **WARSTWY + PRZYCIĄGANIE + DUPLIKAT + EKSPORT/IMPORT + TŁO PODGLĄDU ZROBIONE (gałąź
`feat/scene-editor-pro-2026-08`).** Warstwy bez pola `z` — tablica `elements` JEST kolejnością
renderowania, więc „na wierzch/pod spód" to przestawienie w tablicy (zero zmian formatu).
Przyciąganie do krawędzi/osi sąsiadów i środka płótna z prowadnicami. Duplikat sceny, eksport/import
układu do JSON (import walidowany jak każdy zapis), podgląd na tle zrzutu z gry (localStorage,
nie trafia do OBS). Wszystko **bez migracji bazy**.
**ZOSTAJE:** więcej stylowania elementu (opacity/rotacja). Effort resztki: **S**.

### 2c. Widgety/Alerty — własna grafika/animacja
✅ **WŁASNA GRAFIKA/ANIMACJA ALERTU ZROBIONE (slice 6).** `AlertTypeConfig` dostał `imageUrl`+
`mediaType` (2 nullable kolumny — migracja w `MIGRACJA-2026-08.md §3`). Per typ alertu
(follow/sub/cheer/donation…) streamer wgrywa („Wgraj plik" z §2a) lub wkleja URL własnej grafiki
LUB **wideo/animacji** — render jako banner nad kartą alertu (`<img>`/`<video>` autoplay/muted/loop),
`src` przez `safeMediaUrl` po obu stronach. Doklejane serwerowo tą samą ścieżką co `soundUrl`
(getAlertTypeConfigs → alert-feed → OverlayClient → AlertCard). Podgląd na żywo w panelu Alerty.
**ZOSTAJE:** per-`CustomAlert` media (manualne alerty), pełny designer warstwowy (media jako tło +
tekst na wierzchu), Lottie. Effort resztki: **M**.

### 2d. Branding — bogatsze tokeny
Dodać nullable kolumny `Tenant`: `--surface/--border/--text-muted/--radius/--accent-2`, font,
tenant-default theme, dynamiczny favicon/OG per-tenant (rozszerzyć istniejący `/api/og`). Effort: **M-L**.

### 2e. SongRequest — reszta kontrolek + serwisy
Wymaga realnego **playera overlay** (YouTube IFrame) → wtedy pause/skip/next są prawdziwe. Ban
konkretnego utworu (nowa kolumna/tabela). Spotify (Web API, per-tenant OAuth) realny; Tidal/
SoundCloud ciężkie. Effort: **M** (player+Spotify) → **L** (reszta).

### 2f. „Koło za donaty" — panel admina (silnik JUŻ istnieje!)
✅ **PANEL ADMINA ZROBIONY (slice 3).** `penalties.ts` implementował już „donate → losowa kara",
kwota+katalog per-streamer, dostarczanie do OBS — ale **nie było UI, żeby to włączyć/skonfigurować**.
Dodana sekcja `Penalties` (grupa Ekonomia): przełącznik + ostrzeżenie prawne z API, próg wpłaty,
cooldown, edytowalny katalog kar (nazwa/waga/próg/efekt OBS/pasma intensywności+czasu), historia
losowań. ⚠️ **Prawnie:** moduł na **realne pieniądze** (art. 2 ust. 5) — `enabled=false` domyślnie,
`LEGAL_WARNING` zawsze widoczne przy przełączniku. Konfiguracja ≠ włączenie; włączenie to gated-
decyzja właściciela po sygnale prawnika (prawnik oczyścił kasyno chipsowe, NIE ten moduł).
✅ **FREE-TEXT „WYZWANIE" ZROBIONE (slice 3).** Nowy typ kary `challenge`: nie rusza OBS, tylko
WYŚWIETLA `label` jako prominentny banner w źródle „Sterowanie OBS" na czas z pasma; streamer robi
to ręcznie (dokładnie „streamer musi coś zrobić jak grać"). Idzie tym samym at-most-once kanałem co
reszta kar (zero nowej trasy/overlaya, zero wyścigu na money-path). W panelu: wybór typu „Wyzwanie",
pola OBS się chowają, liczy się tekst + czas.
**ZOSTAJE (roadmap):** opcjonalna animacja koła dla losowania donatu (reuse `/overlay/wheel`, dziś
efekt jest natychmiastowy). Effort resztki: **S-M**.

---

## 3. Nowe projekty

### 3a. Rozszerzenie OBS
Sterowanie OBS **już istnieje** (browser-source `obs-websocket-js` → `ws://localhost:4455`, reguły,
sceny, Hue, kary). Realne luki, nie „nowe rozszerzenie":
- 🔒 **Osobny token sterowania** — dziś jeden token overlaya zwraca też **odszyfrowane hasło OBS +
  klucz Hue** (`obs-control/config`). Świadomy trade-off z działającą mitygacją (rotowalny token
  per-tenant); szczegóły `docs/DECISIONS.md`. **Plan: OPT-IN** — osobny token jako wybór streamera
  (domyślnie token overlaya, zero breakage), bo właściwy fix wymaga migracji + **re-paste URL-a
  źródła OBS u KAŻDEGO streamera** (zmiana łamiąca). Effort: **M** (schemat + rotacja + UI).
- **Kanał komend na żądanie** — dziś OBS jest tylko reaktywny; dodać `/api/obs-control/commands`
  (kolejka at-most-once jak przy karach) + spiąć istniejący `/deck` (mobilna konsola streamera):
  „przełącz scenę TERAZ", „wycisz mik", „replay". To pierwszy konkretny wycinek „rozszerzenia OBS".
Effort: **M** (token+commands) → **L** (dock OBS).

### 3b. Multistreaming — uczciwa ocena
Prawdziwy multistreaming = **fan-out RTMP** (serwerowe media/ffmpeg, terytorium Restream/Aitum) —
**NIE rozszerzenie przeglądarki** i nie na Vercelu. Co JEST buildowalne:
- **Konsola multistreamingu** — agregacja czatu+eventów Twitch+Kick+YouTube **już działa w bocie**;
  podnieść do produktu: fan-out moderacji (ban/timeout na wszystkich naraz), unified inbox. Effort: **M-L**.
- Sam RTMP-fan-out: integracja z zewnętrznym relayem, nie własna infra. (Do decyzji właściciela.)

---

## 4. Dodatkowe pomysły (propozycje)

- **Push zamiast pollingu** (Supabase Realtime/SSE) — overlaye/companion odświeżają się co ~2s;
  push zdejmie opóźnienie i obciążenie (pool DB max:3). Effort: M, dotyka prod.
- **Favicon/OG/PWA per-tenant** — dziś founder-hardcoded; reuse wzorca dynamicznego `/api/og`.
- **Wybór fontu + tenant-default theme + motywy sezonowe**.
- **Program pokrycia testami warstwy HTTP** — ~220 route'ów i ~173 komponenty są dziś ~0% pokryte
  (realne repo-wide ~10.6%); money-critical liby mają ~98-100%, ale warstwa HTTP nie.
- **DNS-rebinding hardening** (pinned-IP egress) dla outbound webhooków — z diagnostyki.

---

## 5. Kolejność rekomendowana

1. **SLICE 2 — bezpieczeństwo/onboarding:** onboarding platform dla nie-foundera (§0.1), osobny
   token OBS (§3a), PayMedia per-tenant lub usunięcie (§0.2). *Dotyka OAuth/schematu — ostrożnie,
   z runbookiem jak `MIGRACJA-2026-08.md`.*
2. **SLICE 3 — enabler uploadu (§2a)** → odblokowuje sceny/alerty/branding.
3. **SLICE 4 — feature'y na uploadzie:** własne media scen/alertów, bogatszy branding, panel kar.
4. **SLICE 5 — player + Spotify, konsola OBS/multistream.**
