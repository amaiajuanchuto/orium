/**
 * Tag lookup/creation helper shared by the create and update entry tools.
 */
import type postgres from "postgres";

/**
 * Returns the id of the tag matching `name` (case-insensitive, trimmed),
 * inserting it first if it doesn't already exist.
 *
 * @param sql - Open database connection.
 * @param name - Raw tag name as provided by the caller.
 * @returns The id of the matching (or newly created) tag row.
 */
export async function upsertTag(
  sql: postgres.Sql | postgres.TransactionSql,
  name: string,
): Promise<number> {
  const normalized = name.trim().toLowerCase();

  await sql`INSERT INTO tags (name) VALUES (${normalized}) ON CONFLICT (name) DO NOTHING`;

  const [row] = await sql<
    { id: number }[]
  >`SELECT id FROM tags WHERE name = ${normalized}`;

  return row!.id;
}

/**
 * Lists every tag name in the shared vocabulary, alphabetically. Tags are
 * global (not per-user) by design — see the multi-user migration.
 *
 * @param sql - Open database connection.
 * @returns All tag names, alphabetically.
 */
export async function listTagNames(sql: postgres.Sql): Promise<string[]> {
  return (await sql<{ name: string }[]>`SELECT name FROM tags ORDER BY name`).map(
    (row) => row.name,
  );
}
