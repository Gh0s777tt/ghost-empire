## Co i po co

<!-- Krótko: co zmienia ten MR i dlaczego. Podlinkuj issue, jeśli jest. -->

## Checklista

- [ ] `npm run verify-all` przechodzi (typecheck · lint · testy jednostkowe + integracyjne · `docs:check`)
- [ ] **Dokumentacja zaktualizowana**, jeśli zmiana dotyka publicznego zachowania:
    - [ ] `CHANGELOG.md` → `[Unreleased]` (wymusza `npm run docs:check`)
    - [ ] `docs/ENDPOINTS.md`, jeśli zmieniono trasy `/api/*` (wymusza job `docs-drift` w CI)
    - [ ] `docs/ARCHITECTURE.md` / `docs/ENV.md`, jeśli zmienił się model danych, auth, multi-tenant lub zmienne środowiskowe
- [ ] `ROADMAP.md` zaktualizowany, jeśli MR domyka lub rusza punkt roadmapy
- [ ] Brak sekretów w kodzie/diffie; nowe zmienne ENV opisane w `docs/ENV.md`
- [ ] Migracje / `prisma db push` uzgodnione (prod DB jest gated — pytaj przed każdym)
- [ ] Commity w konwencji [Conventional Commits](https://www.conventionalcommits.org/)

## Uwagi

<!-- Ryzyka, decyzje, rzeczy do sprawdzenia przy review. -->
