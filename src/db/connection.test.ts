import { describe, expect, it } from "vitest";
import { createDatabase } from "./connection.js";

describe("createDatabase", () => {
  it("creates the entries, tags, and entry_tags tables", () => {
    const db = createDatabase(":memory:");

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'sqlite_sequence' ORDER BY name",
      )
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toEqual(["entries", "entry_tags", "tags"]);

    db.close();
  });

  it("enforces the mood_rating and energy_level check constraints", () => {
    const db = createDatabase(":memory:");

    expect(() =>
      db
        .prepare("INSERT INTO entries (date, mood_rating, energy_level) VALUES (?, ?, ?)")
        .run("2026-07-23", 11, 5),
    ).toThrow();

    expect(() =>
      db
        .prepare("INSERT INTO entries (date, mood_rating, energy_level) VALUES (?, ?, ?)")
        .run("2026-07-23", 5, 0),
    ).toThrow();

    db.close();
  });

  it("supports linking entries to tags via entry_tags", () => {
    const db = createDatabase(":memory:");

    const entryId = db
      .prepare(
        "INSERT INTO entries (date, mood_rating, energy_level, sleep_hours, notes) VALUES (?, ?, ?, ?, ?)",
      )
      .run("2026-07-23", 7, 6, 7.5, "Felt good today").lastInsertRowid;

    const tagId = db
      .prepare("INSERT INTO tags (name) VALUES (?)")
      .run("grateful").lastInsertRowid;

    db.prepare("INSERT INTO entry_tags (entry_id, tag_id) VALUES (?, ?)").run(
      entryId,
      tagId,
    );

    const tagsForEntry = db
      .prepare(
        `SELECT t.name FROM tags t
         JOIN entry_tags et ON et.tag_id = t.id
         WHERE et.entry_id = ?`,
      )
      .all(entryId)
      .map((row) => (row as { name: string }).name);

    expect(tagsForEntry).toEqual(["grateful"]);

    db.close();
  });

  it("cascades deletes from entries to entry_tags", () => {
    const db = createDatabase(":memory:");

    const entryId = db
      .prepare("INSERT INTO entries (date, mood_rating, energy_level) VALUES (?, ?, ?)")
      .run("2026-07-23", 5, 5).lastInsertRowid;

    const tagId = db
      .prepare("INSERT INTO tags (name) VALUES (?)")
      .run("tired").lastInsertRowid;

    db.prepare("INSERT INTO entry_tags (entry_id, tag_id) VALUES (?, ?)").run(
      entryId,
      tagId,
    );

    db.prepare("DELETE FROM entries WHERE id = ?").run(entryId);

    const remaining = db
      .prepare("SELECT COUNT(*) AS count FROM entry_tags WHERE entry_id = ?")
      .get(entryId) as { count: number };

    expect(remaining.count).toBe(0);

    db.close();
  });
});
