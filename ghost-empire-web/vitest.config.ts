import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // WHY 30 s instead of vitest's 5 s default: the RTP guards in `gt-games.test.ts` /
    // `economy.test.ts` are Monte-Carlo runs of 20k–300k iterations — that N is what gives them
    // the statistical power to catch a house-edge regression on money-critical game math, so it
    // must NOT be shrunk for speed. Unloaded, the slowest lands at ~300 ms, i.e. the default left
    // only ~17× headroom — narrower than real-world load variance. A machine running parallel
    // builds measured a ~30× slowdown, which timed out the scratch-card RTP test and blocked a
    // push with no code defect behind it. 30 s absorbs that (~100× headroom) while still failing
    // a genuinely hung test — these are pure-logic tests with no DB/network (repo convention), so
    // a hang means an infinite loop, not a slow dependency.
    testTimeout: 30_000,
    // Coverage via `npm run test:coverage` (v8).
    //
    // AUDYT: do tej pory tu NIE BYŁO progów ("this is for VISIBILITY, not a gate"), a job
    // `test:unit:web` w CI wyciągał procent regexem tylko na badge — nie porównywał go z
    // niczym. Skutek: MR kasujący testy albo dokładający 2 000 nieprzetestowanych linii
    // przechodził na zielono. Dla repo, którego własny CLAUDE.md nazywa ścieżki
    // economy/RNG/token "money-critical" i wymaga "new behavior ships with a test",
    // 1 210 testów nie chroniło STRUKTURALNIE niczego.
    //
    // Progi poniżej to ZAPADKA (ratchet), nie aspiracja: ustawione ~3 pkt PONIŻEJ realnego
    // pomiaru z 2026-08-12 (statements 50.14 · branches 49.54 · functions 54.24 · lines 49.8,
    // 134 pliki / 1 210 testów, wszystkie zielone). Są więc zielone DZIŚ i czerwienieją
    // wyłącznie na REGRESJI. Zasada podnoszenia: gdy realny pomiar urośnie trwale o >5 pkt,
    // podnieś podłogę — NIGDY jej nie obniżaj, żeby przepchnąć MR-a (dokładnie tak E-Bot
    // stracił swoją: próg został tam raz zjechany w dół pod bieżący stan).
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 47,
        branches: 46,
        functions: 51,
        lines: 46,
      },
      exclude: [
        "**/*.test.ts",
        "**/*.config.*",
        "**/*.d.ts",
        "src/messages/**",
        "src/generated/**",
        ".next/**",
        "vitest.setup.ts",
      ],
    },
  },
  resolve: {
    alias: {
      // Mirror the tsconfig "@/*" -> "./src/*" path alias so tests import like app code.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
