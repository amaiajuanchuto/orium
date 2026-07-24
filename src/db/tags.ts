import type Database from "better-sqlite3";

/**
 * Returns the id of the tag matching `name` (case-insensitive, trimmed),
 * inserting it first if it doesn't already exist.
 */
export function upsertTag(db: Database.Database, name: string): number {
  const normalized = name.trim().toLowerCase();

  db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").run(normalized);

  const row = db.prepare("SELECT id FROM tags WHERE name = ?").get(normalized) as {
    id: number;
  };

  return row.id;
}
