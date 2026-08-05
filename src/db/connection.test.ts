import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "./connection.js";
import { ensureTestUsers, TEST_USER_ID } from "./testUser.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

describe("createDatabase", () => {
  const sql = createDatabase(TEST_DATABASE_URL);

  beforeEach(async () => {
    await sql`TRUNCATE entries, tags, entry_tags RESTART IDENTITY CASCADE`;
    await ensureTestUsers(sql);
  });

  afterAll(async () => {
    await sql.end();
  });

  it("connects to the entries, tags, and entry_tags tables", async () => {
    const tables = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('entries', 'tags', 'entry_tags')
      ORDER BY table_name
    `;

    expect(tables.map((row) => row.table_name)).toEqual([
      "entries",
      "entry_tags",
      "tags",
    ]);
  });

  it("enforces the mood_rating and energy_level check constraints", async () => {
    await expect(
      sql`INSERT INTO entries (user_id, date, mood_rating, energy_level) VALUES (${TEST_USER_ID}, '2026-07-23', 11, 5)`,
    ).rejects.toThrow();

    await expect(
      sql`INSERT INTO entries (user_id, date, mood_rating, energy_level) VALUES (${TEST_USER_ID}, '2026-07-23', 5, 0)`,
    ).rejects.toThrow();
  });

  it("supports linking entries to tags via entry_tags", async () => {
    const [entry] = await sql<{ id: number }[]>`
      INSERT INTO entries (user_id, date, mood_rating, energy_level, sleep_hours, notes)
      VALUES (${TEST_USER_ID}, '2026-07-23', 7, 6, 7.5, 'Felt good today')
      RETURNING id
    `;
    const [tag] = await sql<{ id: number }[]>`
      INSERT INTO tags (name) VALUES ('a-connection-test-tag') RETURNING id
    `;

    await sql`INSERT INTO entry_tags (entry_id, tag_id) VALUES (${entry!.id}, ${tag!.id})`;

    const tagsForEntry = await sql<{ name: string }[]>`
      SELECT t.name FROM tags t
      JOIN entry_tags et ON et.tag_id = t.id
      WHERE et.entry_id = ${entry!.id}
    `;

    expect(tagsForEntry.map((row) => row.name)).toEqual(["a-connection-test-tag"]);
  });

  it("cascades deletes from entries to entry_tags", async () => {
    const [entry] = await sql<{ id: number }[]>`
      INSERT INTO entries (user_id, date, mood_rating, energy_level)
      VALUES (${TEST_USER_ID}, '2026-07-23', 5, 5)
      RETURNING id
    `;
    const [tag] = await sql<{ id: number }[]>`
      INSERT INTO tags (name) VALUES ('another-connection-test-tag') RETURNING id
    `;

    await sql`INSERT INTO entry_tags (entry_id, tag_id) VALUES (${entry!.id}, ${tag!.id})`;
    await sql`DELETE FROM entries WHERE id = ${entry!.id}`;

    const [remaining] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM entry_tags WHERE entry_id = ${entry!.id}
    `;

    expect(remaining!.count).toBe(0);
  });

  it("cascades entry deletes when the owning user is deleted from auth.users", async () => {
    const [entry] = await sql<{ id: number }[]>`
      INSERT INTO entries (user_id, date, mood_rating, energy_level)
      VALUES (${TEST_USER_ID}, '2026-07-23', 5, 5)
      RETURNING id
    `;

    await sql`DELETE FROM auth.users WHERE id = ${TEST_USER_ID}`;

    const [remaining] = await sql<
      { count: number }[]
    >`SELECT COUNT(*)::int AS count FROM entries WHERE id = ${entry!.id}`;

    expect(remaining!.count).toBe(0);
  });
});
