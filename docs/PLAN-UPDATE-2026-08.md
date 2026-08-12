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
Dziś **nie ma żadnego uploadu** (brak Vercel Blob / Supabase Storage / multipart). To blokuje:
własne obrazy/wideo scen, własne grafiki/animacje alertów, upload tła.
- **Decyzja do podjęcia:** Supabase Storage (już mamy Supabase) vs Vercel Blob. Rekomendacja:
  **Supabase Storage** — zero nowego dostawcy, per-tenant prefix klucza, RLS.
- Zakres: `POST /api/upload` (auth, limit MIME/rozmiar, per-tenant prefix), picker plików, podmiana
  „URL-only" na „URL lub upload" w scenach/alertach/brandingu. Effort: **L**.

### 2b. Kreator Scen — własne sceny statyczne/animowane
Edytor już jest. Dodać: typ elementu `image`/`video` (URL-only szybko, upload po 2a), warstwy
(z-index), więcej stylowania elementu (kolor/opacity/rotacja). Effort: **M** (URL-only) → **L** (upload+animacje).

### 2c. Widgety/Alerty — własna grafika/animacja
**Szybko (URL-only):** kolumny `imageUrl`+`mediaType` na `AlertTypeConfig`/`CustomAlert` (migracja) +
gałąź `<img>`/`<video>` w `AlertCard`. Pełny designer alertów (media jako tło + tekst/kwota na
wierzchu, Lottie/WebM) po 2a. Effort: **M** → **L**.

### 2d. Branding — bogatsze tokeny
Dodać nullable kolumny `Tenant`: `--surface/--border/--text-muted/--radius/--accent-2`, font,
tenant-default theme, dynamiczny favicon/OG per-tenant (rozszerzyć istniejący `/api/og`). Effort: **M-L**.

### 2e. SongRequest — reszta kontrolek + serwisy
Wymaga realnego **playera overlay** (YouTube IFrame) → wtedy pause/skip/next są prawdziwe. Ban
konkretnego utworu (nowa kolumna/tabela). Spotify (Web API, per-tenant OAuth) realny; Tidal/
SoundCloud ciężkie. Effort: **M** (player+Spotify) → **L** (reszta).

### 2f. „Koło za donaty" — panel admina (silnik JUŻ istnieje!)
`penalties.ts` w całości implementuje „donate → losowa kara/wyzwanie", kwota+katalog per-streamer,
dostarczanie do OBS. **Brakuje tylko UI admina** (nie ma `PenaltiesManager` ani wpisu w nawigacji)
+ free-text „wyzwanie" (dziś tylko akcje OBS) + opcjonalna animacja koła (reuse `/overlay/wheel`).
⚠️ **Prawnie:** to moduł na **realne pieniądze** (art. 2 ust. 5), zostaje `enabled=false` za bramką
`LEGAL_WARNING`. UI budujemy, żeby właściciel MÓGŁ włączyć po sygnale prawnika — samo włączenie to
jego decyzja. Effort: **M**.

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
