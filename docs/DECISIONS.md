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
