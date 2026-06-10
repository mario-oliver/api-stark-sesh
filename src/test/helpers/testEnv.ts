/**
 * Call once at the top of `before()` in any integration test suite.
 * Swaps DATABASE_URL → DATABASE_URL_TEST so the Prisma singleton (first
 * imported via dynamic import of buildTestApp) connects to the test branch.
 */
export function setupTestEnv(): void {
  const testUrl = process.env.DATABASE_URL_TEST
  if (!testUrl) {
    throw new Error(
      'DATABASE_URL_TEST is not set. Integration tests require a dedicated test database (Neon branch).'
    )
  }
  if (testUrl === process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL_TEST must differ from DATABASE_URL to avoid mutating the dev database during tests.'
    )
  }
  process.env.DATABASE_URL = testUrl
}
