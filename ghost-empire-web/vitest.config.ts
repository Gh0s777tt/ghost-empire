import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
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
