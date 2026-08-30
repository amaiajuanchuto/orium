/**
 * Core entry CRUD/query logic, shared between the MCP tools and the REST
 * API. Returns plain structured data (null/empty for "not found"/"no
 * data") — any chat-style friendly messages are the caller's job to add.
 */
import type postgres from "postgres";
import { upsertTag } from "../db/tags.js";
import type { Entry, EntryWithTags } from "../db/types.js";

/** Thrown when an update would move an entry onto a date that already has one for this user. */
export class EntryDateConflictError extends Error {}

export interface CreateEntryInput {
  date: string;
  mood_rating: number;
  energy_level: number;
  sleep_hours?: number;
  notes?: string;
  tags?: string[];
}

export interface UpdateEntryInput {
  date?: string;
  mood_rating?: number;
  energy_level?: number;
  sleep_hours?: number;
  notes?: string;
  tags?: string[];
}

export interface ListEntriesFilters {
  from?: string;
  to?: string;
  tag?: string;
  min_mood_rating?: number;
  max_mood_rating?: number;
  min_energy_level?: number;
  max_energy_level?: number;
  limit?: number;
}

/**
 * Fetches the tag names linked to an entry, ordered alphabetically.
 */
async function getTagsForEntry(
  sql: postgres.Sql | postgres.TransactionSql,
  entryId: number,
): Promise<string[]> {
  return (
    await sql<{ name: string }[]>`
      SELECT t.name FROM tags t
      JOIN entry_tags et ON et.tag_id = t.id
      WHERE et.entry_id = ${entryId}
      ORDER BY t.name
    `
  ).map((row) => row.name);
}

/**
 * Creates a journal entry for a date (optionally linking it to one or more
 * tags, created on demand) and returns the persisted row. A user can only
 * have one entry per date (enforced by a unique constraint): calling this
 * again for a date that already has an entry replaces its mood/energy/
 * sleep/notes with the new values rather than erroring or creating a
 * duplicate. A provided `tags` array fully replaces the entry's existing
 * tags; omitting `tags` leaves them untouched.
 *
 * @param sql - Open database connection.
 * @param userId - The authenticated user's id.
 * @param input - The entry's fields.
 * @returns The persisted entry row (without a `tags` field).
 */
export async function createEntry(
  sql: postgres.Sql,
  userId: string,
  input: CreateEntryInput,
): Promise<Entry> {
  return sql.begin(async (tx) => {
    const [row] = await tx<Entry[]>`
      INSERT INTO entries (user_id, date, mood_rating, energy_level, sleep_hours, notes)
      VALUES (${userId}, ${input.date}, ${input.mood_rating}, ${input.energy_level}, ${input.sleep_hours ?? null}, ${input.notes ?? null})
      ON CONFLICT (user_id, date) DO UPDATE SET
        mood_rating = EXCLUDED.mood_rating,
        energy_level = EXCLUDED.energy_level,
        sleep_hours = EXCLUDED.sleep_hours,
        notes = EXCLUDED.notes
      RETURNING *
    `;
    const entryId = row!.id;

    if (input.tags !== undefined) {
      await tx`DELETE FROM entry_tags WHERE entry_id = ${entryId}`;

      for (const tagName of input.tags) {
        const tagId = await upsertTag(tx, tagName);
        await tx`
          INSERT INTO entry_tags (entry_id, tag_id)
          VALUES (${entryId}, ${tagId})
          ON CONFLICT DO NOTHING
        `;
      }
    }

    return row!;
  });
}

/**
 * Fetches an entry by id along with its linked tag names, scoped to `userId`.
 *
 * @param sql - Open database connection.
 * @param userId - The authenticated user's id.
 * @param id - Id of the entry to fetch.
 * @returns The entry with its tags, or null if no such entry exists for this user.
 */
export async function getEntryById(
  sql: postgres.Sql | postgres.TransactionSql,
  userId: string,
  id: number,
): Promise<EntryWithTags | null> {
  const [entry] = await sql<
    Entry[]
  >`SELECT * FROM entries WHERE id = ${id} AND user_id = ${userId}`;

  if (!entry) return null;

  return { ...entry, tags: await getTagsForEntry(sql, id) };
}

/**
 * Partially updates an existing journal entry by id: only the provided
 * fields are changed, `updated_at` is refreshed by a database trigger,
 * and a provided `tags` array fully replaces the entry's existing tags.
 *
 * @param sql - Open database connection.
 * @param userId - The authenticated user's id.
 * @param id - Id of the entry to update.
 * @param input - Fields to change; omitted fields are left as-is.
 * @returns The full updated entry with its tags, or null if no such entry exists for this user.
 */
export async function updateEntry(
  sql: postgres.Sql,
  userId: string,
  id: number,
  input: UpdateEntryInput,
): Promise<EntryWithTags | null> {
  const [exists] =
    await sql`SELECT 1 FROM entries WHERE id = ${id} AND user_id = ${userId}`;
  if (!exists) return null;

  return sql.begin(async (tx) => {
    const updates: Record<string, unknown> = {};
    if (input.date !== undefined) updates.date = input.date;
    if (input.mood_rating !== undefined) updates.mood_rating = input.mood_rating;
    if (input.energy_level !== undefined) updates.energy_level = input.energy_level;
    if (input.sleep_hours !== undefined) updates.sleep_hours = input.sleep_hours;
    if (input.notes !== undefined) updates.notes = input.notes;

    if (Object.keys(updates).length > 0) {
      try {
        await tx`UPDATE entries SET ${tx(updates)} WHERE id = ${id} AND user_id = ${userId}`;
      } catch (err) {
        if (err && typeof err === "object" && "code" in err && err.code === "23505") {
          throw new EntryDateConflictError(
            `An entry already exists for ${input.date}. Update that entry instead, or choose a different date.`,
          );
        }
        throw err;
      }
    } else {
      // No scalar fields changed (e.g. a tags-only update) — still touch
      // the row so the updated_at trigger fires, matching this function's
      // documented behavior of always refreshing updated_at.
      await tx`UPDATE entries SET updated_at = DEFAULT WHERE id = ${id} AND user_id = ${userId}`;
    }

    if (input.tags !== undefined) {
      await tx`DELETE FROM entry_tags WHERE entry_id = ${id}`;

      for (const tagName of input.tags) {
        const tagId = await upsertTag(tx, tagName);
        await tx`
          INSERT INTO entry_tags (entry_id, tag_id)
          VALUES (${id}, ${tagId})
          ON CONFLICT DO NOTHING
        `;
      }
    }

    const [entry] = await tx<
      Entry[]
    >`SELECT * FROM entries WHERE id = ${id} AND user_id = ${userId}`;
    return { ...entry!, tags: await getTagsForEntry(tx, id) };
  });
}

/**
 * Deletes a journal entry by id, scoped to `userId`. Its tag links in
 * entry_tags are removed automatically via ON DELETE CASCADE.
 *
 * @param sql - Open database connection.
 * @param userId - The authenticated user's id.
 * @param id - Id of the entry to delete.
 * @returns The deleted entry, or null if no such entry existed for this user.
 */
export async function deleteEntry(
  sql: postgres.Sql,
  userId: string,
  id: number,
): Promise<Entry | null> {
  const [entry] = await sql<
    Entry[]
  >`SELECT * FROM entries WHERE id = ${id} AND user_id = ${userId}`;

  if (!entry) return null;

  await sql`DELETE FROM entries WHERE id = ${id} AND user_id = ${userId}`;
  return entry;
}

/**
 * Lists journal entries (most recent first) filtered by date range,
 * mood/energy range, and/or tag, each annotated with its linked tag names.
 *
 * @param sql - Open database connection.
 * @param userId - The authenticated user's id.
 * @param filters - Optional filters and result limit (defaults to 20).
 * @returns Matching entries, most recent first.
 */
export async function listEntries(
  sql: postgres.Sql,
  userId: string,
  filters: ListEntriesFilters,
): Promise<EntryWithTags[]> {
  const {
    from,
    to,
    tag,
    min_mood_rating,
    max_mood_rating,
    min_energy_level,
    max_energy_level,
    limit,
  } = filters;

  const entries = await sql<Entry[]>`
    SELECT e.* FROM entries e
    WHERE e.user_id = ${userId}
      AND (${from ?? null}::date IS NULL OR e.date >= ${from ?? null})
      AND (${to ?? null}::date IS NULL OR e.date <= ${to ?? null})
      AND (${min_mood_rating ?? null}::int IS NULL OR e.mood_rating >= ${min_mood_rating ?? null})
      AND (${max_mood_rating ?? null}::int IS NULL OR e.mood_rating <= ${max_mood_rating ?? null})
      AND (${min_energy_level ?? null}::int IS NULL OR e.energy_level >= ${min_energy_level ?? null})
      AND (${max_energy_level ?? null}::int IS NULL OR e.energy_level <= ${max_energy_level ?? null})
      AND (
        ${tag?.trim().toLowerCase() ?? null}::text IS NULL
        OR e.id IN (
          SELECT et.entry_id FROM entry_tags et
          JOIN tags t ON t.id = et.tag_id
          WHERE t.name = ${tag?.trim().toLowerCase() ?? null}
        )
      )
    ORDER BY e.date DESC, e.id DESC
    LIMIT ${limit ?? 20}
  `;

  return Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      tags: await getTagsForEntry(sql, entry.id),
    })),
  );
}

/**
 * Escapes Postgres `LIKE` wildcard characters (`%`, `_`, `\`) in `value` so
 * it can be safely embedded in a `LIKE ... ESCAPE '\'` pattern as a literal
 * substring match.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

const SEARCH_MAX_RESULTS = 50;

/**
 * Case-insensitive search for `keyword` across entry notes, returning
 * matches (with their tags) ordered by date descending, capped at 50 results.
 *
 * @param sql - Open database connection.
 * @param userId - The authenticated user's id.
 * @param keyword - Substring to search for within notes.
 * @returns Matching entries, most recent first.
 */
export async function searchEntries(
  sql: postgres.Sql,
  userId: string,
  keyword: string,
): Promise<EntryWithTags[]> {
  const pattern = `%${escapeLikePattern(keyword)}%`;

  const entries = await sql<Entry[]>`
    SELECT * FROM entries
    WHERE user_id = ${userId}
      AND notes IS NOT NULL AND LOWER(notes) LIKE LOWER(${pattern}) ESCAPE '\\'
    ORDER BY date DESC, id DESC
    LIMIT ${SEARCH_MAX_RESULTS}
  `;

  return Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      tags: await getTagsForEntry(sql, entry.id),
    })),
  );
}

/**
 * Looks up the journal entry for today's date (based on the system clock),
 * along with its linked tags.
 *
 * @param sql - Open database connection.
 * @param userId - The authenticated user's id.
 * @returns Today's entry with its tags, or null if none has been logged yet.
 */
export async function getTodayEntry(
  sql: postgres.Sql,
  userId: string,
): Promise<EntryWithTags | null> {
  const today = new Date().toISOString().slice(0, 10);

  const [entry] = await sql<
    Entry[]
  >`SELECT * FROM entries WHERE date = ${today} AND user_id = ${userId}`;

  if (!entry) return null;

  return { ...entry, tags: await getTagsForEntry(sql, entry.id) };
}
