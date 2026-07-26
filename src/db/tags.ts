/**
 * Tag lookup/creation helper shared by the create and update entry tools.
 */
import type Database from "better-sqlite3";

/**
 * Returns the id of the tag matching `name` (case-insensitive, trimmed),
 * inserting it first if it doesn't already exist.
 *
 * @param db - Open database connection.
 * @param name - Raw tag name as provided by the caller.
 * @returns The id of the matching (or newly created) tag row.
 */
export function upsertTag(db: Database.Database, name: string): number {
  const normalized = name.trim().toLowerCase();

  db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").run(normalized);

  const row = db.prepare("SELECT id FROM tags WHERE name = ?").get(normalized) as {
    id: number;
  };

  return row.id;
}
