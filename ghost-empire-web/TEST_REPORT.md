# TEST_REPORT.md — Ghost Empire / E-Forge (ghost-empire-web)

Rola: QA / test engineer. Cel: wywołać realne defekty + dopisać testy na krytycznej
logice, które by je złapały. Nie zmieniałem kodu aplikacji pod zielony wynik —
każdy czerwony wynik to znalezisko, a nie „do naprawy w produkcie".

Data: 2026-07-05 · środowisko: lokalne (unit, `environment: node`, bez sieci/DB).

> **Status (aktualizacja):** D-1, D-2, D-3 **naprawione** (#796, branch `qa/fix-defects-d1-d2-d3`).
> Testy regresyjne przełączone ze `skip` na aktywne (zielone po fixie). U-2 świadomie
> pozostawione bez zmiany kodu (repo-wide wzorzec legacy-fallback — patrz Triage). Suite: 787 zielonych.

---

## 1. Podsumowanie

- **Punkt zerowy (Faza 0):** `npx vitest run` — **94 pliki / 746 testów, wszystkie zielone**,
  brak flaky (2× uruchomienie identyczne). Testy integracyjne (`tests/integration/**`)
  wymagają Dockera/Postgresa — **Docker niedostępny w tym środowisku → nie uruchamiane**
  (patrz „Luki w testach"). Pokrycie unit: **statements 43.8% / branches 44.5%** — dużo
  białych plam poza czystą logiką `src/lib`.
- **Dodane testy:** **+41** (po naprawie defektów regresyjne `it.skip` są aktywne),
  5 nowych plików. Cały suite po zmianach: **99 plików / 787 zielone / 0 skip**.
- **Defekty:** 3 potwierdzone (2× Średni, 1× Niski) + 1 uwaga „works-as-designed, ryzykowne".
- **Ocena gotowości:** logika domenowa jest solidna i dobrze pokryta tam, gdzie testy
  istnieją (crypto 91%, economy 98%, companion-token). Znalezione defekty są **brzegowe**
  (wyścigi / cross-tenant na ścieżce tokena / higiena repo) — żaden nie jest blokerem
  wydania, ale **D-3 warto naprawić przed szerszym roll-outem multi-tenant**.

---

## 2. Defekty

| # | Severity | Obszar | Opis | Odtworzenie | Oczekiwane vs faktyczne | Test odsłaniający |
|---|----------|--------|------|-------------|--------------------------|-------------------|
| **D-3** | **Średni** | `api/companion` GET (auth cross-tenant) | Token companiona niesie `tenantId`, ale route go **ignoruje**. Żądanie z tokenem portalu A obsłużone na Hoście portalu B tworzy/odczytuje companiona pod **tenantem z Hosta (B)**, nie z tokena. | Token dla `tenant-A` → GET na `portal-b.example/api/companion`. | Oczek.: token spoza portalu → 401 (albo scope po `payload.tenantId`). Fakt.: 200, `companion.upsert` `create.tenantId = "tenant-B"`, nazwa domyślna z cudzego portalu. | `src/app/api/companion/__tests__/companion-route-auth.test.ts` → „documents D-3…" (aktywny, zielony na obecnym kodzie) + `it.skip` „D-3 regression" (pożądane zachowanie). |
| **D-1** | **Średni** | `lib/rate-limit.ts` (DB path) | Wyścig dwóch **pierwszych** żądań o ten sam klucz: oba widzą brak bucketa, drugi `create` pada na kluczu głównym `key` (**P2002**). Generyczny `catch` nie rozróżnia P2002 od awarii DB → **fail-open** ze **zmyślonym `remaining = maxHits`**. Hit nie jest policzony. | 2 równoległe pierwsze trafienia w to samo `key` (np. `drop:claim:<userId>`). | Oczek.: P2002 = „bucket właśnie powstał" → ponowić inkrement (hit policzony). Fakt.: request przepuszczony jak przy awarii DB, licznik zgubiony → chwilowe osłabienie anti-brute-force. | `src/lib/__tests__/rate-limit-behavior.test.ts` → „documents D-1…" (aktywny) + `it.skip` „D-1 regression". |
| **D-2** | **Niski** | Higiena repo / gate `tsc` | Zbłąkane kopie plików z sufiksem `" 2"` (artefakty synchronizacji iCloud/Dropbox): m.in. **śledzony** `src/lib/bot-heartbeat 2.ts` (identyczny duplikat) oraz nietrackowane `src/app/api/**/route 2.ts` (3×), `bot-heartbeat.test 2.ts`. Duplikaty w `.next/types/*d 2.ts` **łamią `npx tsc --noEmit`** (wymagany gate) błędami „Duplicate identifier". | `find . -name "* 2.*"` (16 trafień) · `npx tsc --noEmit` → TS2300/TS2717. | Oczek.: brak duplikatów; `tsc` czysty. Fakt.: gate `tsc` czerwony lokalnie; ryzyko przypadkowego zacommitowania duplikatu route (kolizja routingu Next). | Brak testu (defekt strukturalny, nie logiczny) — wskazówka w Triage. |

Uwaga: D-1 potwierdzony w schemacie — `RateLimitBucket.key` to `@id`, więc podwójny
`create` realnie rzuca P2002; `catch` w `rateLimitDb` nie filtruje kodu błędu.

---

## 3. Uwagi (nie-defekty: works-as-designed / ryzykowne, do decyzji właściciela)

- **U-2 — `lib/daily-tasks.ts`, user bez `tenantId`:** dla `tenantId === null` zapytanie o
  katalog questów leci **bez filtra tenanta** (`...(tenantId ? {tenantId} : {})`), więc
  użytkownik-legacy bije postęp w questach „messages" **każdego** portalu naraz. To
  świadomy wzorzec legacy-fallback (spójny z resztą repo), ale w pełni multi-tenant
  świecie to wektor cross-tenant. Udokumentowane testem „UWAGA U-2" (zielony — opisuje
  bieżące zachowanie, nie asertuje że jest poprawne). Decyzja: zostawić czy wymusić
  `tenantId` na hot-path award.
- **companion-token / crypto dev-key:** w teście token podpisywany jest publicznym
  dev-kluczem (`NODE_ENV != production`). W produkcji `crypto.ts` **fail-fast** wymaga
  `ENCRYPTION_KEY`/`NEXTAUTH_SECRET` — sprawdzone, poprawne.

---

## 4. Triage (co blokuje wydanie)

- **Nic nie blokuje wydania.** Wszystkie 3 defekty są brzegowe.
- **Naprawić przed szerszym roll-outem multi-tenant:** **D-3** — dziś portale są w praktyce
  1:1 z sesją, ale gdy tokeny zaczną krążyć między portalami, brak weryfikacji `tenantId`
  z tokena to realne pomieszanie tożsamości / utworzenie companiona pod złym portalem.
  Fix: po `verifyCompanionToken` porównać `payload.tenantId` z `getCurrentTenant().id`
  i zwrócić 401 przy niezgodności (odkomentować `it.skip` „D-3 regression").
- **Szybki fix higieniczny:** **D-2** — usunąć pliki `" 2"` (`git rm "src/lib/bot-heartbeat 2.ts"`,
  skasować nietrackowane kopie), dodać `**/* 2.*` do `.gitignore`. Odblokowuje lokalny `tsc`.
- **Może poczekać:** **D-1** — rozróżnić P2002 w `rateLimitDb` (ponów inkrement) zamiast
  fail-open; realny wpływ tylko w oknie pierwszego trafienia per klucz.

---

## 5. Dodane testy

Uruchomienie wszystkich: `cd ghost-empire-web && npx vitest run`
Ostatni przebieg: **99 plików / 783 zielone / 2 skip** (2.0 s), zero flaky.

| Plik | Co pokrywa | Wynik |
|------|-----------|-------|
| `src/lib/__tests__/rate-limit-behavior.test.ts` | Limiter Redis+DB: limit dokładny (max vs max+1), okno stałe (reset po wygaśnięciu), Retry-After z `expiresAt`, degradacja Redis→DB (throw i zły kształt eval), fail-open vs fail-closed, **D-1**. Mock prisma/redis, fake timers. | 11 zielonych + 1 skip |
| `src/lib/__tests__/companion-token-edges.test.ts` | Granica dokładnie 7 dni, skew zegara <60 s vs „z przyszłości", podmiana podpisu między dwoma ważnymi tokenami, obcięcie/rozszerzenie tokena, `bearerFromRequest` (case-insensitive, trim, złe nagłówki). | 6 zielonych |
| `src/lib/__tests__/tenant-resolution.test.ts` | **SECURITY:** ignorowanie sfałszowanego `x-tenant-slug` (host decyduje); subdomena→slug; custom domain→`Tenant.domain`; nieznany host→domyślny; awaria DB→`FALLBACK_TENANT`; poza request-scope→domyślny; sanityzacja `socialLinks` (odrzut `javascript:`, cap 12, lowercase platform); tabela prawdy `isFounderBrand`/`isPlatformBrand` (#746). Mock next/headers+prisma, `resetModules` (React `cache()`). | 9 zielonych |
| `src/lib/__tests__/daily-tasks-progress.test.ts` | Skoping katalogu per-tenant, short-circuit bez questów, batch upsertów w jednej transakcji z `today()`, cache TTL 5 min + izolacja per (tenant, trigger), **U-2**. Mock prisma, fake timers, `resetModules`. | 7 zielonych |
| `src/app/api/companion/__tests__/companion-route-auth.test.ts` | Autoryzacja GET `/api/companion`: 401 bez sesji/tokena, 401 na śmieciowy token, ważny token → tylko **własne** dane posiadacza, nagłówki CORS, **D-3**. Mock auth/prisma/tenant, token realnie podpisany. | 5 zielonych + 1 skip |

**Walidacja jakości testów (mutation testing — wstrzyknąłem błąd, sprawdziłem że test czerwienieje, potem revert):**
- `rate-limit`: `count > maxHits` → `count >= maxHits` ⇒ test padł ✅
- `companion-token`: rozluźnienie okna „z przyszłości" ⇒ test padł ✅
- `tenant`: `subSlug = x-tenant-slug ?? resolveTenantSlug(host)` (zaufanie nagłówkowi) ⇒ test SECURITY padł ✅

Żaden dodany test nie jest tautologiczny — wszystkie asertują realny wynik funkcji, nie
zamockowaną wartość wejściową.

---

## 6. Pokrycie — stan po zmianach

**Dobrze pokryte (logika domenowa):** `crypto` (91%), `economy`/`economy-health` (98–100%),
`companion`/`companion-token` (round-trip + brzegi czasu + auth route), `tenant-host` (100%),
`tenants` (100%), `rate-limit` (zachowanie limitu + degradacja + fail-open/closed),
`tenant.ts` resolution (host-only, fallbacki, sanityzacja socials), `daily-tasks` (skoping+cache).

**Nadal białe plamy (konkretne moduły bez testów lub <15% linii):**
`platform-tokens.ts` (0%), `tenant-seed.ts` (17%), `auth-adapter.ts` (7%),
`admin.ts`/`admin-assistant.ts`, `audit.ts`, `codes.ts`, `balance-bus.ts`,
`economy-anomaly.ts`, oraz **większość route handlerów** `src/app/api/**` (poza dodanym
companion). Endpoint drops/claim ma zabezpieczenia (atomowy ordinal w tx, P2002→409),
ale **brak testu jednostkowego** — kandydat nr 1 na następną iterację (transakcja +
kolejność rezerwacji claimu vs licznik + rate-limit).

---

## 7. Luki w testach (czego nie dało się przetestować i dlaczego)

- **Integracja z prawdziwą bazą** (`tests/integration/**`, `test:integration`): wymaga
  Dockera/Postgresa — **niedostępny w tym środowisku**. Nie uruchamiane; nie mylić z unit.
  Tu żyją realne testy transakcji drops/duels/predictions — do przejścia na maszynie z Dockerem.
- **E2E** (`e2e/smoke.spec.ts`, Playwright): wymaga postawionego dev-servera + przeglądarki;
  nie uruchamiane w tej sesji (Faza 3 pominięta świadomie — skupienie na Fazach 0–1 i 4).
- **Prawdziwy Upstash/Redis, Stripe, e-mail:** celowo mockowane (determinizm, brak sieci).
- **Ścieżka `drops/claim` end-to-end** (transakcja, wyścig bonus-slots): logikę wyścigu
  potwierdza komentarz #audit-M4 w kodzie; test jednostkowy transakcji wymaga rozbudowanego
  mocka `$transaction(tx)` — odłożony jako następny krok o największej wartości.

---

## 8. Jak uruchomić

```bash
cd ghost-empire-web
npx vitest run                      # cały suite unit (99 plików / 783+2skip)
npx vitest run src/lib/__tests__/rate-limit-behavior.test.ts   # pojedynczy plik
npx vitest run --coverage           # raport pokrycia (v8)
```

Skip-y (`it.skip` D-1/D-3 regression) są celowe: pozostają czerwone-po-odkomentowaniu na
zepsutym kodzie, a zielone dopiero po naprawie defektu — gotowy łapacz regresji.
