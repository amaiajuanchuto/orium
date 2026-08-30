/**
 * Full-account data export — every journal entry (with tags) and the
 * profile, as one JSON document a user can download and keep. This is the
 * "take your data with you" side of the account lifecycle; account
 * deletion (see auth/admin.ts) is the other half.
 */
import type postgres from "postgres";
import { listEntries } from "./entries.js";
import { getProfile } from "./profile.js";
import type { EntryWithTags } from "../db/types.js";
import type { Profile } from "../db/types.js";

export interface UserExport {
  exported_at: string;
  profile: Profile | null;
  entries: EntryWithTags[];
}

/** No real account will ever approach this; it's a safety cap, not an expected size. */
const EXPORT_MAX_ENTRIES = 100_000;

/**
 * Gathers everything the app stores for a user into one exportable document.
 *
 * @param sql - Open database connection.
 * @param userId - The authenticated user's id.
 */
export async function exportUserData(
  sql: postgres.Sql,
  userId: string,
): Promise<UserExport> {
  const [profile, entries] = await Promise.all([
    getProfile(sql, userId),
    listEntries(sql, userId, { limit: EXPORT_MAX_ENTRIES }),
  ]);

  return { exported_at: new Date().toISOString(), profile, entries };
}
