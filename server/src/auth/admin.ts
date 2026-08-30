/**
 * Supabase Admin API access — used only for account deletion. Deliberately
 * a raw `fetch` against the Admin REST endpoint rather than pulling in
 * `@supabase/supabase-js` as a server dependency for one call.
 *
 * The service role key this needs bypasses RLS and can act as any user —
 * it must never reach the client, and is read from its own env var rather
 * than threaded through the same path as publishable keys.
 */

/**
 * Permanently deletes a Supabase Auth user. Every table with a
 * `REFERENCES auth.users (id) ON DELETE CASCADE` foreign key (entries,
 * profiles) is cleaned up by Postgres as a result — there is nothing else
 * to delete on the app's side.
 *
 * @param supabaseUrl - The Supabase project URL.
 * @param serviceRoleKey - The project's service role (admin) key.
 * @param userId - The Supabase Auth user id to delete.
 */
export async function deleteSupabaseUser(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to delete Supabase user ${userId}: ${res.status} ${await res.text()}`,
    );
  }
}
