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
      ],
    ],
    // Tematy bywają po polsku i dłuższe niż domyślne 100 — nie wymuszaj wielkości
    // liter i podnieś limit nagłówka.
    "subject-case": [0],
    "header-max-length": [2, "always", 120],
  },
};
