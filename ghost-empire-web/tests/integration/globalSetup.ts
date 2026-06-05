// Runs once before the integration suite: push the Prisma schema into the
// throwaway test database so every table exists. Idempotent.
import { execSync } from "node:child_process";
import { testDbUrl } from "./db-url";

export default function globalSetup() {
  const url = testDbUrl();

  // Plain `db push` — prisma 7 reads the schema + datasource from prisma.config.ts
  // (TEST_DATABASE_URL wins there). On a fresh/empty test DB there's nothing to lose,
  // so it runs non-interactively. Extra flags (--schema/--accept-data-loss) conflict
  // with the config in prisma 7, so they're intentionally omitted.
  execSync("npx prisma db push", {
    stdio: "inherit",
    env: { ...process.env, TEST_DATABASE_URL: url, DATABASE_URL: url, DIRECT_URL: url },
  });
}
