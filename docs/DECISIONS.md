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

## `min-release-age=7` w `.npmrc` — karencja na świeże wersje z npm

- **CO:** `ghost-empire-web/.npmrc` ustawia `min-release-age=7` — rozwiązywanie zależności
  nigdy nie sięgnie po wersję opublikowaną w ciągu ostatnich 7 dni. Lista wyjątków
  (`min-release-age-exclude`) jest **pusta** i ma taka zostać.
- **DLACZEGO (a nie „uciszenie reguły" semgrepa `npm-missing-minimum-release-age`):** ten
  projekt jest na atak przez rejestr wystawiony **bardziej** niż przeciętny. Vercel przy
  deployu robi ŚWIEŻY `npm install`, który na nowo rozwiązuje zakresy — a **43 z 47**
  zależności to carety (`^`). Lockfile ich tam nie chroni (to dokładnie mechanizm z #654).
  To jedyne miejsce w pipelinie, gdzie złośliwa świeżo wypuszczona wersja wjeżdża na
  produkcję bez ludzkiego przeglądu; przejęte konto maintainera bywa unpublishowane w
  godziny, więc 7-dniowe okno realnie zamyka to okno ekspozycji.
- **ZASIĘG (zweryfikowany, nie założony):**
  - `npm ci` (CI + lokalnie) odtwarza lockfile i **nie** rozwiązuje zakresów → opcja go nie
    dotyka. Sprawdzone: `npm ci` na npm 11.17 z włączoną opcją przechodzi zielono.
  - Klucz wymaga **npm ≥ 11.10**. Obraz CI `node:22-bookworm-slim` niesie **npm 10.9.8**,
    który nieznany klucz po prostu ignoruje (sprawdzone: `legacy-peer-deps` nadal działa,
    zero warningu, zero błędu). Czyli: działa tam, gdzie npm jest dość nowy, i jest
    bezpiecznym no-opem tam, gdzie nie jest — **zero ryzyka dla obecnego deployu**.
  - Wszystkie 4 zależności pinowane dokładnie (`prisma`/`@prisma/client`/`@prisma/adapter-pg`
    7.8.0, `next-auth` 5.0.0-beta.32) mają w dniu wdrożenia **26+ dni** → okno nie blokuje
    dziś żadnej instalacji.
- **KOSZT / RYZYKO REZYDUALNE:** pilny bump bezpieczeństwa (jak `next-auth` beta.32 /
  `@auth/core` 0.41.3 — GHSA-x445, #518) może trafić w to okno i zostać opóźniony do 7 dni.
  **Wyjście awaryjne, świadome i jednorazowe:** `npm install <pkg>@<ver> --min-release-age 0`,
  albo trwale dla jednej paczki wpis w `min-release-age-exclude` — każdy taki wpis to dziura
  w tej ochronie, więc **zawsze z komentarzem i datą przeglądu**.
- **PUŁAPKA PRZY EDYCJI:** reguła semgrepa dopasowuje **tekst pliku i nie pomija komentarzy** —
  dosłowne `min-release-age` z `=` i zerem w komentarzu czerwieni cały pipeline („sets it too
  low"). Dlatego w `.npmrc` wariant awaryjny zapisany jest z **odstępem** zamiast `=`.

## AES-GCM — jawna długość tagu uwierzytelniającego (`authTagLength: 16`)

- **CO:** `src/lib/crypto.ts` przekazuje `{ authTagLength: 16 }` do `createCipheriv`
  **i** `createDecipheriv`, zamiast polegać na domyślnej długości tagu Node'a.
- **DLACZEGO to NIE była kosmetyka pod semgrepa (`gcm-no-tag-length`):** zmierzone na
  **Node 22** — wersji, którą realnie niesie produkcja (`engines.node >=22`, obraz CI
  `node:22-bookworm-slim`) — deszyfrator zbudowany **bez** tej opcji przyjmuje **skrócony**
  tag: dobrze uformowana koperta z 4-bajtowym tagiem uwierzytelniła się i `decryptSecret`
  zwrócił `""` zamiast `null`. Node 26 to odrzuca, więc sprawdzenie tylko na nowym Node
  uznałoby znalezisko za false-positive — **na produkcyjnym runtimie było realne**.
  Skrócony tag to wykładniczo tańsze fałszerstwo, a powtarzane próby przeciw obciętemu
  tagowi wyciekają klucz uwierzytelniający GHASH. Moduł chroni `Tenant.botSecret` i tokeny
  OAuth `Connection`, więc długość tagu jest **parametrem uwierzytelnienia**, nie formatowaniem.
- **ZGODNOŚĆ WSTECZNA (udowodniona testem, nie założona):** układ koperty
  `iv[12] | tag[16] | ciphertext` **nie zmienia się** — `getAuthTag()` zawsze emitował pełne
  16 bajtów, więc wiersze już zapisane w bazie czytają się bez migracji. Pokryte testami:
  round-trip blobów zapisanych **przez writer sprzed poprawki** (v1 i v2) oraz odczyt
  świeżego szyfrogramu „starym" czytnikiem (rollback commita nie osieroci nowych zapisów).
- **DOWÓD REGRESJI:** 6 testów `crypto.test.ts` **failuje** na Node 22 po cofnięciu samej
  opcji (`expected '' to be null`) — to nie są testy tautologiczne.
