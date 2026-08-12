# Runbook wdrożenia — audyt 2026-08 (zmiany na żywej bazie)

Runbook dla zmian z gałęzi `fix/audit-2026-08`, które dotykają **produkcyjnej bazy Supabase**.
Reszta zmian audytu to czysty kod/CI/docs i deployuje się normalnym pushem — **tutaj są tylko
te, które wymagają świadomej akcji właściciela na bazie**. Repo używa `prisma db push` (nie
migracji) — patrz [`RLS.md`](RLS.md) i CLAUDE.md; ten dokument jest odtwarzalnym zapisem tego,
co `db push` faktycznie zrobi, żeby dało się to przejrzeć PRZED odpaleniem.

> **Kolejność ma znaczenie.** Najpierw deploy kodu (Vercel z gałęzi), potem `db push`, potem
> backfille. Kod jest wstecznie zgodny z bazą PRZED zmianą (dual-read), więc chwilowy rozjazd
> nie psuje logowania ani bota.

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

**Kroki:**
1. Deploy kodu (Vercel podchwytuje gałąź). Kod działa jeszcze na bazie sprzed zmiany.
2. `cd ghost-empire-web && npm run db:push` — przejrzyj plan (ma odpowiadać SQL wyżej), zatwierdź.
   Kolumna `connections.tenantId` istnieje. **RLS:** `connections` już ma RLS ON (nie tworzymy
   tabeli, tylko kolumnę — nic do zrobienia, ale potwierdź `RLS.md`).
3. `npx tsx scripts/backfill-connection-tenant.ts` — ustawia `tenantId` istniejących połączeń z
   tenanta ich użytkownika. Idempotentny. Reszta NULL to konta legacy bez portalu (self-heal
   przy kolejnym logowaniu — patrz `lib/auth.ts`).

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
