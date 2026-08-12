# Świadome decyzje architektoniczne (audyt 2026-08)

Rejestr **celowych** decyzji, które podczas audytu bezpieczeństwa czytały się jak
otwarte znaleziska, a nimi nie są. Dla każdej: **CO** jest zrobione i **DLACZEGO**.
Trzymamy je tu, żeby kolejny przegląd nie „naprawiał" ich na ślepo i nie cofał
świadomego kompromisu.

## `force-dynamic` na root layoucie

- **CO:** root layout jest renderowany dynamicznie (`export const dynamic = "force-dynamic"`),
  a nie statycznie / w PPR.
- **DLACZEGO:** świadomy kompromis pod **per-request nonce CSP**. Nagłówek
  Content-Security-Policy jest ustawiany per-request w `src/proxy.ts` z świeżym
  nonce (`script-src 'nonce-…' 'strict-dynamic'`), żeby zrzucić `'unsafe-inline'`.
  Statyczny render/PPR nie potrafi ponieść per-request nonce. Opt-out do
  static/PPR wymaga **realnej walidacji CSP + perf** (czy nonce nadal się zgadza,
  czy nie psujemy strict-dynamic, jaki jest realny zysk) — nie robimy tego na ślepo.

## Plaintext tokeny OAuth w tabeli `accounts`

- **CO:** tokeny OAuth w tabeli `accounts` (NextAuth) leżą **celowo** plaintext —
  nie są szyfrowane w spoczynku.
- **DLACZEGO:** aplikacja **nie czyta** tokenów platform z modelu `Account`. Tokeny
  potrzebne do wołania platform (Twitch/YouTube/Discord/Kick itd.) idą z osobnego,
  **ZASZYFROWANEGO** modelu `Connection`. Tokeny w `Account` służą tylko warstwie
  logowania NextAuth. Szyfrowanie Account-tokenów było już wdrożone (#645) i
  **cofnięte (#657) jako SEV1** — złamało logowanie na obu portalach — przy
  **zerowej korzyści**, bo i tak nie są tam źródłem prawdy dla integracji. Powtórne
  szyfrowanie `Account` to regres bez zysku; szyfrowanie żyje tam, gdzie ma sens
  (`Connection`).

## Hardcoded permanent-admin email

- **CO:** w kodzie istnieje literał e-maila stałego admina (founder).
- **DLACZEGO:** **zmitygowane w rundzie 1** audytu. Źródłem prawdy jest teraz
  `ADMIN_EMAILS` (env) — zastępuje literał i emituje głośne ostrzeżenie, gdy jest
  puste. Literał **pozostał wyłącznie jako fallback anty-lockout**, żeby błędna /
  pusta konfiguracja `ADMIN_EMAILS` nie odcięła jedynego admina od portalu. To nie
  jest białkowy hardcode uprawnień, tylko bezpiecznik ostatniej szansy.

## Token OBS zwraca odszyfrowane hasło OBS + klucz Hue (obs-control/config)

- **CO:** trasa `obs-control/config` oddaje źródłu przeglądarkowemu w OBS odszyfrowane
  hasło OBS WebSocket + klucz mostka Hue, autoryzowana **tym samym** per-tenant tokenem
  overlaya co nieszkodliwe feedy wyświetlania. Token jest w URL-u źródła OBS (może wyciec
  przez historię, logi OBS, screenshare, Referer).
- **DLACZEGO (świadomy trade-off, udokumentowany też w nagłówku trasy):** źródło OBS to
  *tylko URL* — nie wyśle nagłówka `Authorization`, więc bearer w query stringu to JEDYNY
  kształt tego transportu. Mitygacja, która działa: token jest **rotowalny per-tenant**
  (`POST /api/admin/alerts {action:"regenerate_token"}`) i rotacja natychmiast unieważnia
  każdy wyciekły URL.
- **CZEMU NIE „naprawione teraz":** rozdzielenie sekretnego feedu na własny token wymaga
  (a) drugiej kolumny na `StreamAlertSettings` (migracja db push) ORAZ (b) **re-paste URL-a
  źródła OBS u KAŻDEGO streamera** — zmiana ŁAMIĄCA działające setupy na żywym produkcie.
- **PLAN (śledzony, `docs/PLAN-UPDATE-2026-08.md`):** dostarczyć osobny token sterowania jako
  **OPT-IN** — streamer włącza ostrzejszy token, gdy jest gotów re-paste'ować, domyślnie
  nadal działa token overlaya (zero breakage). Slice-3 (schemat + rotacja + UI).

## PayMedia — kanał founder-global (nie per-tenant)

- **CO:** webhook `webhooks/paymedia` używa jednego globalnego `PAYMEDIA_WEBHOOK_SECRET`
  i pisze `tenantId: null` (kredytuje tablicę foundera), w przeciwieństwie do pozostałych
  5 kanałów donacji (per-integration, per-tenant).
- **DLACZEGO to NIE aktywny wyciek:** PayMedia **nie jest** w liście `PROVIDERS` panelu
  integracji donacji — żaden tenant nie może skierować tam wpłat (to tylko rozpoznawany
  *typ źródła* + etykieta transakcji, nie self-serve integracja). Kredytuje wyłącznie
  founder-a, bo to founderowy kanał.
- **DYSPOZYCJA:** świadomie **founder-global** (kanał platformowy jak Stripe-global).
  Jeśli kiedyś ma być white-label — przerobić na per-integration id-w-URL jak Ko-fi
  (`docs/PLAN-UPDATE-2026-08.md §0.2`). Do tego czasu: nie oferować tenantom, nie reklamować
  jako metody płatności portalu.
