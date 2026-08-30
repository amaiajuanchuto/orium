import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type postgres from "postgres";
import { createDatabase } from "../db/connection.js";
import { ensureTestUsers, TEST_USER_ID } from "../db/testUser.js";
import { registerCreateEntryTool } from "./createEntry.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function setup(sql: postgres.Sql) {
  const server = new McpServer({ name: "orium-mcp-test", version: "0.0.0" });
  registerCreateEntryTool(server, sql, TEST_USER_ID);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return { client };
}

describe("create_entry tool", () => {
  const sql = createDatabase(TEST_DATABASE_URL);
  let client: Client;

  beforeEach(async () => {
    await sql`TRUNCATE entries, tags, entry_tags RESTART IDENTITY CASCADE`;
    await ensureTestUsers(sql);
    ({ client } = await setup(sql));
  });

  afterAll(async () => {
    await sql.end();
  });

  it("inserts an entry and returns it", async () => {
    const result = await client.callTool({
      name: "create_entry",
      arguments: {
        date: "2026-07-23",
        mood_rating: 7,
        energy_level: 6,
        sleep_hours: 7.5,
        notes: "Felt good today",
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const entry = JSON.parse(content[0]!.text);

    expect(entry).toMatchObject({
      date: "2026-07-23",
      mood_rating: 7,
      energy_level: 6,
      sleep_hours: 7.5,
      notes: "Felt good today",
    });

    const [row] = await sql`SELECT * FROM entries WHERE id = ${entry.id}`;
    expect(row).toBeDefined();
    expect(row!.user_id).toBe(TEST_USER_ID);
  });

  it("creates and links tags", async () => {
    const result = await client.callTool({
      name: "create_entry",
      arguments: {
        date: "2026-07-23",
        mood_rating: 5,
        energy_level: 5,
        tags: ["Grateful", "grateful", "tired"],
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const entry = JSON.parse(content[0]!.text);

    const tagNames = (
      await sql<{ name: string }[]>`
        SELECT t.name FROM tags t
        JOIN entry_tags et ON et.tag_id = t.id
        WHERE et.entry_id = ${entry.id}
        ORDER BY t.name
      `
    ).map((r) => r.name);

    expect(tagNames).toEqual(["grateful", "tired"]);
  });

  it("replaces the existing entry when called again for the same date", async () => {
    await client.callTool({
      name: "create_entry",
      arguments: {
        date: "2026-07-23",
        mood_rating: 5,
        energy_level: 5,
        tags: ["tired"],
      },
    });

    const result = await client.callTool({
      name: "create_entry",
      arguments: {
        date: "2026-07-23",
        mood_rating: 8,
        energy_level: 7,
        tags: ["calm"],
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    const entry = JSON.parse(content[0]!.text);
    expect(entry).toMatchObject({ mood_rating: 8, energy_level: 7 });

    const rows = await sql`SELECT * FROM entries WHERE date = '2026-07-23'`;
    expect(rows).toHaveLength(1);

    const tagNames = (
      await sql<{ name: string }[]>`
        SELECT t.name FROM tags t
        JOIN entry_tags et ON et.tag_id = t.id
        WHERE et.entry_id = ${entry.id}
        ORDER BY t.name
      `
    ).map((r) => r.name);
    expect(tagNames).toEqual(["calm"]);
  });

  it("rejects an out-of-range mood_rating", async () => {
    const result = await client.callTool({
      name: "create_entry",
      arguments: {
        date: "2026-07-23",
        mood_rating: 11,
        energy_level: 5,
      },
    });

    expect(result.isError).toBe(true);
  });

  it("rejects a malformed date", async () => {
    const result = await client.callTool({
      name: "create_entry",
      arguments: {
        date: "07/23/2026",
        mood_rating: 5,
        energy_level: 5,
      },
    });

    expect(result.isError).toBe(true);
  });

  it("rejects a date in the future", async () => {
    // +2 days: dateSchema tolerates +1 day to cover users ahead of the
    // server's UTC clock, so this must be further out to be rejected.
    const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const result = await client.callTool({
      name: "create_entry",
      arguments: {
        date: futureDate,
        mood_rating: 5,
        energy_level: 5,
      },
    });

    expect(result.isError).toBe(true);
  });
});
