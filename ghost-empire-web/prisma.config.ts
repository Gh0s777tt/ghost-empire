// Prisma 7 config. Runtime queries connect through the pg driver adapter
// (see src/lib/prisma.ts) — the schema no longer carries a `url`. This file
// supplies the connection for CLI commands that need the database directly:
// `prisma db push`, `migrate`, `studio`. Uses the direct (non-pooled) URL.
import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer auto-loads .env, so CLI commands (db push/migrate/studio)
// wouldn't see DATABASE_URL/DIRECT_URL. Load the local env files ourselves.
// On Vercel these files don't exist (env is already injected) — loadEnvFile
// throws ENOENT there, which we ignore. Build/generate never need the url, so
// this can't break them either.
for (const file of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* file not present (e.g. on Vercel) — env already in process.env */
  }
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    // TEST_DATABASE_URL wins so integration tests / CI push to a throwaway DB
    // (set only in those environments) without touching prod .env.local values.
    url: process.env.TEST_DATABASE_URL ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
