// src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Prisma 7 connects through a driver adapter (the `url` lives no longer in the
// schema). The pg Pool `max` is kept low (3) for the Supabase free tier + Vercel
// serverless — mirrors the previous DATABASE_URL `connection_limit=3`. Prepared
// statements are NOT cached by default (no statementNameGenerator), which is
// exactly what the Supabase transaction pooler (:6543) needs.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 3 });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
