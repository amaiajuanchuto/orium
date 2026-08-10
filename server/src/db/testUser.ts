/**
 * Test-only helper for seeding a fake Supabase Auth user, needed because
 * entries.user_id has a foreign key into auth.users — used by every tool
 * test file, since local dev's auth service is disabled but the auth
 * schema tables (and their constraints) still exist.
 */
import type postgres from "postgres";

/** A fixed user id used across all tool tests. */
export const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

/** A second fixed user id, used by tests that verify cross-user isolation. */
export const OTHER_TEST_USER_ID = "00000000-0000-0000-0000-000000000002";

/**
 * Ensures the given user ids exist in auth.users, so entries can reference
 * them. Idempotent — safe to call in every test's beforeEach.
 */
export async function ensureTestUsers(
  sql: postgres.Sql,
  userIds: string[] = [TEST_USER_ID, OTHER_TEST_USER_ID],
): Promise<void> {
  for (const id of userIds) {
    await sql`INSERT INTO auth.users (id) VALUES (${id}) ON CONFLICT (id) DO NOTHING`;
  }
}
