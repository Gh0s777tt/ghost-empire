// Unit-test setup. Some lib modules (e.g. rate-limit.ts) import the Prisma client
// at module load, and PrismaClient validates that its datasource env vars exist
// when instantiated. Provide harmless dummies so those imports succeed — no test
// ever runs a query, so nothing actually connects to a database.
process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
process.env.DIRECT_URL ||= "postgresql://test:test@localhost:5432/test";
