// commitlint — Conventional Commits dla monorepo ghost-empire.
// Baza: @commitlint/config-conventional. Rozszerzenia dopasowane do REALNEJ
// historii repo — obok feat/fix/docs/... w commitach pojawiają się też typy
// security / ux / a11y / quality; dopuszczamy je, żeby walidacja nie blokowała
// utrwalonego stylu zespołu. Marker `[skip-changelog]` w temacie jest dozwolony
// (to część subject, nie wpływa na typ). Root package.json nie ma pola `type`,
// więc plik .js ładuje się jako CommonJS (module.exports).

/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
        // typy spotykane w historii repo — dopuszczone celowo:
        "security",
        "ux",
        "a11y",
        "quality",
        // AUDYT (medium, „15% tematów nie przechodzi własnego commitlinta"): `i18n:`
        // to NAJCZĘSTSZY typ spoza bazowego enuma — 55 commitów w historii (dla
        // porównania: `ci` 7, `quality` 1). Poprzednie poszerzenie enuma wzięło
        // security/ux/a11y/quality i po prostu go PRZEOCZYŁO, więc każdy kolejny
        // commit tłumaczeniowy jest formalnie niezgodny z regułami tego repo.
        // Ta sama zasada co wyżej: legalizujemy utrwalony styl, nie tworzymy nowego.
        // ŚWIADOMIE NIE dopisujemy `debug` (3), `lint` (1) ani `perf+docs` (1) —
        // to jednorazowe pomyłki, a nie konwencja; mają zostać czerwone.
        // Uwaga: `i18n` nie występuje w `presetConfig.types` w .releaserc.json, więc
        // (tak jak docs/chore/ci) NIE podbija wersji i nie trafia do release-notes —
        // dopuszczenie go w commitlincie niczego w wydaniach nie zmienia.
        "i18n",
      ],
    ],
    // Tematy bywają po polsku i dłuższe niż domyślne 100 — nie wymuszaj wielkości
    // liter i podnieś limit nagłówka.
    "subject-case": [0],
    "header-max-length": [2, "always", 120],
  },
};
