# Runbook wdrożenia — audyt 2026-08 (zmiany na żywej bazie)

Runbook dla zmian z gałęzi `fix/audit-2026-08`, które dotykają **produkcyjnej bazy Supabase**.
Reszta zmian audytu to czysty kod/CI/docs i deployuje się normalnym pushem — **tutaj są tylko
te, które wymagają świadomej akcji właściciela na bazie**. Repo używa `prisma db push` (nie
migracji) — patrz [`RLS.md`](RLS.md) i CLAUDE.md; ten dokument jest odtwarzalnym zapisem tego,
co `db push` faktycznie zrobi, żeby dało się to przejrzeć PRZED odpaleniem.

> **⚠️ Kolejność ma znaczenie i różni się dla dwóch zmian:**
> - **Connection (§1): `db push` MUSI być PRZED deployem nowego kodu.** Zregenerowany klient
>   Prisma zapisuje `tenantId` w upsercie połączenia — gdyby nowy kod wdrożył się przed
>   dodaniem kolumny, insert trafiłby w nieistniejącą kolumnę i **złamał logowanie**. `db push`
>   jest za to bezpieczny przy STARYM kodzie (dodaje nullable kolumnę + luzuje unique; stary
>   kod nie pisze `tenantId` i nie używał starego globalnego klucza).
> - **botSecret (§2): kolejność dowolna** — brak zmiany schematu, odczyt jest dual-read.
>
> Ponieważ `main` auto-deployuje na Vercel przy pushu, praktyczna sekwencja to:
> **(1) `db push` na prod z gałęzi/lokalnie → (2) backfill → (3) merge gałęzi do `main`
> (dopiero to wdraża nowy kod).** NIE merguj do `main` przed `db push`.

---

## 1. `Connection.tenantId` — per-tenant tożsamość platform (jedyna zmiana SCHEMATU)

**Po co:** globalny unique `connections(platform, platformId)` pozwalał podpiąć dany login
platformy tylko RAZ na całej platformie — ten sam widz nie mógł mieć konta Twitch na portalu A
i B. Teraz unique jest per-portal.

**Bezpieczeństwo zmiany:** żaden kod nie używał starego klucza `platform_platformId` w zapytaniu
(zweryfikowane), a jedyne miejsce TWORZĄCE Connection (`lib/auth.ts`, upsert w signIn) stempluje
już `tenantId`. Poluzowanie unique (dodanie kolumny do złożenia) **nie może odrzucić istniejących
wierszy**: stare wiersze mają unikalne `(platform, platformId)` z poprzedniego constraintu, więc
tuple `(platform, platformId, NULL)` są rozłączne i nowy unique trzyma się na nich bez backfillu.

**Co zrobi `npm run db:push`** (dokładny delta-SQL, wygenerowany przez `prisma migrate diff`):

```sql
-- DropIndex
DROP INDEX "connections_platform_platformId_key";
-- AlterTable
ALTER TABLE "connections" ADD COLUMN     "tenantId" TEXT;
-- CreateIndex
CREATE INDEX "connections_tenantId_idx" ON "connections"("tenantId");
-- CreateIndex
CREATE UNIQUE INDEX "connections_platform_platformId_tenantId_key" ON "connections"("platform", "platformId", "tenantId");
```

**Kroki (kolejność obowiązkowa):**
1. `cd ghost-empire-web && npm run db:push` — **na STARYM kodzie (przed mergem do `main`)**.
   Przejrzyj plan (ma odpowiadać SQL wyżej), zatwierdź. Kolumna `connections.tenantId` istnieje.
   Stary kod działa dalej (nie pisze `tenantId`, nie używał starego globalnego klucza). **RLS:**
   `connections` już ma RLS ON (nie tworzymy tabeli, tylko kolumnę — nic do zrobienia, ale
   potwierdź `RLS.md`).
2. `npx tsx scripts/backfill-connection-tenant.ts` — ustawia `tenantId` istniejących połączeń z
   tenanta ich użytkownika. Idempotentny. Reszta NULL to konta legacy bez portalu (self-heal
   przy kolejnym logowaniu — patrz `lib/auth.ts`).
3. **Dopiero teraz** merge `fix/audit-2026-08` → `main` (Vercel wdraża nowy kod, który zaczyna
   pisać `tenantId` do już istniejącej kolumny).

**Rollback:** kod czyta połączenia przez relację `user.tenantId` (kolumny `tenantId` NIE czyta),
więc gdyby coś poszło nie tak, wystarczy revert kodu — kolumna może zostać, jest addytywna.

---

## 2. `Tenant.botSecret` szyfrowany at-rest (BEZ zmiany schematu)

**Po co:** `botSecret` był jedynym sekretem w schemacie trzymanym plaintextem (Connection tokeny,
`secretEnc`/`tokenEnc`, TOTP są szyfrowane). Wyciek backupu/dashboardu Supabase dawał użyteczne
poświadczenie bota. Teraz jest szyfrowany (AES-256-GCM, ten sam `encryptSecret` co reszta).

**Bez migracji:** ciphertext ląduje w istniejącej kolumnie `botSecret TEXT`. Odczyt jest
**dual-read** (`tenant.ts` → `decryptSecret`): przepuszcza legacy plaintext bez zmian i przy dryfie
`ENCRYPTION_KEY` zwraca null → sekret nie matchuje → spadamy na globalny `BOT_SECRET` (podłoga),
a nie na martwy bot-auth. Istniejące plaintextowe sekrety **działają bez żadnej akcji** — zaszyfrują
się przy najbliższej rotacji.

**Krok (opcjonalny, domykający):**
- `npx tsx scripts/backfill-bot-secret-enc.ts` — jednorazowo zaszyfruj sekrety, które są jeszcze
  plaintextem, żeby w bazie nie zostało nic czytelnego. Idempotentny.

> ⚠️ Tenant z `BOT_SECRET_STRICT=1` (opt-in z rundy 1) poczułby dryf `ENCRYPTION_KEY` — jego bot
> musiałby wtedy re-provisionować sekret. To świadomy koszt jego własnego opt-inu w ostrość;
> zwykły tenant spada na globalny sekret.

---

## 3. `AlertTypeConfig` — własna grafika/animacja alertu (2 kolumny, addytywne)

**Po co:** własna grafika/animacja alertu per typ (follow/sub/cheer/donation…) — kolejny feature
updatu (`docs/PLAN-UPDATE-2026-08.md §2c`). Równolegle do istniejącego `soundUrl`.

**Bezpieczeństwo:** obie kolumny **nullable**, `null` = zachowanie jak dotąd (avatar/emoji). Brak
backfillu. Kolejność dowolna względem deployu kodu (kod czyta `null` bez problemu — pole opcjonalne).

**Co zrobi `npm run db:push`** (delta z `prisma migrate diff`):

```sql
-- AlterTable
ALTER TABLE "alert_type_config" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "mediaType" TEXT;
```

Kroki: `cd ghost-empire-web && npm run db:push` (przejrzyj plan = SQL wyżej). RLS: nie tworzymy
tabeli, tylko kolumny — nic do zrobienia. Rollback: kod czyta `null` bezpiecznie, kolumny mogą zostać.

## §4 — `OverlayScene.enabled` (włącz/wyłącz całą scenę)

Gałąź `fix/scene-builder-2026-08`. Streamer chowa całą kompozycję jednym kliknięciem, bez kasowania
układu i bez ruszania źródła w OBS.

**Co zrobi `npm run db:push`** (delta z `prisma migrate diff`):

```sql
-- AlterTable
ALTER TABLE "overlay_scenes" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true;
```

Kroki: `cd ghost-empire-web && npm run db:push` (przejrzyj plan = SQL wyżej). **RLS: nic do zrobienia**
— nie tworzymy tabeli, tylko kolumnę (`overlay_scenes` ma RLS włączone od swojej migracji).

**Addytywna i bezpieczna:** `DEFAULT true` sprawia, że wszystkie istniejące sceny pozostają włączone,
więc migracja nie zmienia niczego, co widz ma na ekranie. **Do czasu jej wykonania** przełącznik
sceny w panelu zwróci błąd (kolumny nie ma), a render traktuje scenę jak włączoną — czyli zachowanie
sprzed zmiany. Włącz/wyłącz pojedynczego ELEMENTU działa **bez** tej migracji (siedzi w JSON `elements`).

Rollback: kod czyta brak kolumny jako „włączona", kolumna może zostać.

---

## §5 — `OverlayScene.isActive` (aktywna scena + stały adres OBS)

Gałąź `feat/scene-live-2026-08`. Streamer wkleja do OBS JEDEN adres (`/overlay/live`) raz na zawsze
i przełącza sceny z panelu albo przyciskiem na Stream Decku — zamiast podmieniać źródło na żywo.

**Co zrobi `npm run db:push`** (delta z `prisma migrate diff`):

```sql
-- AlterTable
ALTER TABLE "overlay_scenes" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false;
-- CreateIndex
CREATE INDEX "overlay_scenes_tenantId_isActive_idx" ON "overlay_scenes"("tenantId", "isActive");
```

Kroki: `cd ghost-empire-web && npm run db:push`. **RLS: nic do zrobienia** — kolumna, nie tabela.

**Dlaczego bez `@@unique([tenantId, isActive])`:** unique blokowałby DWIE *nieaktywne* sceny w tym
samym portalu, a to stan całkowicie normalny. Jedyność aktywnej wymusza trasa API — dwa zapisy
(zeruj wszystkie → ustaw jedną) w **transakcji**, żeby nieudany drugi zapis nie zostawił portalu
z zerem albo dwiema aktywnymi scenami.

**Kolejność nie ma znaczenia — kod jest odporny na brak kolumny.** `GET` panelu ponawia zapytanie bez
`isActive`, `/api/overlay/live` zwraca wtedy „brak aktywnej sceny", a przełącznik (panel i Stream Deck)
oddaje czytelne **503 „wymaga migracji bazy"**. Do czasu migracji cała reszta edytora działa, a adresy
`/overlay/scene/<id>` zachowują się jak dotąd.

Rollback: kod czyta brak kolumny jako „żadna scena nie jest aktywna", kolumna może zostać.

---

## §6 — paleta portalu i krój (`Tenant.surfaceColor` / `textColor` / `fontFamily`)

Gałąź `feat/portal-palette-2026-08`. `brandColor` był JEDYNYM kolorem portalu, więc streamer
z jasnym brandem dostawał nieczytelny tekst i **nie miał jak się o tym dowiedzieć** — panel pokazywał
próbkę koloru, nie czytelność.

**Co zrobi `npm run db:push`:**

```sql
-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "surfaceColor" TEXT,
ADD COLUMN     "textColor" TEXT,
ADD COLUMN     "fontFamily" TEXT;
```

Kroki: `cd ghost-empire-web && npm run db:push`. **RLS: nic do zrobienia** — kolumny, nie tabela.

**Wszystkie trzy nullable, `null` = zachowanie sprzed zmiany** (kolory i krój z motywu), więc migracja
nie zmienia wyglądu żadnego istniejącego portalu. Kod czyta je przez `t.surfaceColor ?? null`, więc
brak kolumny nie wywraca renderowania — portal po prostu wygląda jak dotąd.

**Bezpieczeństwo:** oba kolory trafiają wprost do deklaracji CSS w `[locale]/layout.tsx`, dlatego zapis
(`/api/onboarding/my`) przepuszcza **wyłącznie `#rrggbb`**, a krój jest identyfikatorem z **zamkniętej
listy** (`lib/brand-palette` → `PORTAL_FONTS`), nie nazwą — `fontStack()` przy nieznanej wartości oddaje
stos systemowy, więc string z bazy nigdy nie wchodzi do `font-family` wprost. Ta sama zasada, co przy
`bgImageUrl`/`safeMediaUrl`.

---

## §7 — `TenantCopy` (własna treść portalu) ⚠️ NOWA TABELA — RLS OBOWIĄZKOWE

Gałąź `feat/portal-copy-2026-08`. Portale wyglądały inaczej, ale MÓWIŁY to samo — `welcome` pochodził
wyłącznie ze wspólnych katalogów i18n. Ta tabela trzyma nadpisania per portal i locale.

**Co zrobi `npm run db:push`:**

```sql
-- CreateTable
CREATE TABLE "tenant_copy" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT,
    "locale"    TEXT NOT NULL,
    "key"       TEXT NOT NULL,
    "value"     TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenant_copy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tenant_copy_tenantId_locale_key_key" ON "tenant_copy"("tenantId", "locale", "key");
CREATE INDEX "tenant_copy_tenantId_locale_idx" ON "tenant_copy"("tenantId", "locale");
```

### ⚠️ Krok DRUGI, obowiązkowy — RLS

To **nowa tabela**, a Postgres tworzy tabele z RLS **wyłączonym**; Supabase automatycznie wystawia
każdą tabelę `public` przez PostgREST kluczowi `anon`. Zgodnie z `docs/RLS.md` i CLAUDE.md, zaraz po
`db push` uruchom w SQL Editorze:

```sql
ALTER TABLE "tenant_copy" ENABLE ROW LEVEL SECURITY;
```

**Bez polityki** — aplikacja łączy się jako właściciel tabeli (`rolbypassrls = true`), więc RLS jej nie
dotyczy, a włączenie bez polityki to default-deny dla `anon`. Weryfikacja:
`select count(*) from pg_class where relname = 'tenant_copy' and not relrowsecurity;` → **0**.

*(Ta tabela nie trzyma sekretów ani PII — same teksty marketingowe — ale zasada obowiązuje każdą nową
tabelę bez wyjątku; to właśnie pominięcie tego kroku zostawiło kiedyś `donation_integrations`
z `secretEnc` widocznym dla roli `anon`.)*

**Kolejność nie ma znaczenia — kod jest odporny na brak tabeli.** Odczyt (`getTenantCopy`) i panel
przy błędzie oddają puste nadpisania, więc strona powitalna renderuje teksty domyślne; zapis zwraca
czytelne **503 „wymaga migracji bazy"**.

---

---

## Czego tu NIE ma (świadomie)

- **Migracje Prisma** — repo używa `db push` z założenia (RLS.md/CLAUDE.md). Ten runbook jest
  odtwarzalnym zapisem, nie wprowadzamy katalogu `prisma/migrations` (to zmiana workflow, decyzja
  właściciela — patrz `docs/DECISIONS.md`).
- **Szyfrowanie tokenów OAuth w `accounts`** — celowo plaintext: apka czyta tokeny platform z
  ZASZYFROWANEGO `Connection`, nie z `Account`; szyfrowanie Account-tokenów było wdrożone (#645)
  i cofnięte (#657) jako SEV1 (złamało logowanie na obu portalach) dla zerowej korzyści. Szczegóły:
  `docs/DECISIONS.md`.
- **Realne-pieniądze moduł kar** (`penalties`, art. 2 ust. 5) — zostaje wyłączony domyślnie; sign-off
  prawnika dotyczył kasyna na darmowych chipsach, nie tego. Patrz `CHIPS-CASINO.md`.
