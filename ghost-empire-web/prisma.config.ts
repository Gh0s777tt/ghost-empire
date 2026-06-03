// Prisma 7 config. Runtime queries connect through the pg driver adapter
// (see src/lib/prisma.ts) — the schema no longer carries a `url`. This file
// supplies the connection for CLI commands that need the database directly:
// `prisma db push`, `migrate`, `studio`. Uses the direct (non-pooled) URL.
//
// NOTE: uses process.env (never throws on load) so it can't break
// `prisma generate` / `next build`. Ensure DIRECT_URL (or DATABASE_URL) is in
// the environment when running db push/migrate (e.g. tsx/Prisma .env loading).
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
