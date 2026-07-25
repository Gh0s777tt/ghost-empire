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
    // Coverage via `npm run test:coverage` (v8). No thresholds — this is for VISIBILITY,
    // not a gate, so it never breaks the build; the suite covers pure logic in src/lib. #audit-N
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "./coverage",
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
