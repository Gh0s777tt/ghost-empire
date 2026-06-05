import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { testDbUrl } from "./tests/integration/db-url";

// Integration tests run against a REAL throwaway Postgres (Docker locally, a service
// container in CI). They live in tests/integration/ so the default unit suite
// (src/**/*.test.ts) never picks them up and never needs a database.
const TEST_DB_URL = testDbUrl();

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/integration/globalSetup.ts"],
    // Point the Prisma driver adapter at the test DB before any module loads it.
    env: {
      DATABASE_URL: TEST_DB_URL,
      DIRECT_URL: TEST_DB_URL,
      TEST_DATABASE_URL: TEST_DB_URL,
    },
    // Schema is shared mutable state — run files serially to avoid cross-test races.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
