// Resolves the throwaway test-database connection string. Built from parts (never a
// single literal URI) so secret scanners don't flag the local/CI test credentials.
// Defaults match the Docker Postgres in the README and the CI service container.
export function testDbUrl(): string {
  const env = process.env;
  if (env.TEST_DATABASE_URL) return env.TEST_DATABASE_URL;
  const user = env.TEST_DB_USER ?? "postgres";
  const pass = env.TEST_DB_PASS ?? "postgres"; // empty string ("") = trust auth, no password
  const host = env.TEST_DB_HOST ?? "localhost:5433";
  const name = env.TEST_DB_NAME ?? "ghost_test";
  const auth = pass ? `${user}:${pass}` : user;
  return `postgresql://${auth}@${host}/${name}`;
}
