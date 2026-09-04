import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type postgres from "postgres";
import { createDatabase } from "../db/connection.js";
import { ensureTestUsers, OTHER_TEST_USER_ID, TEST_USER_ID } from "../db/testUser.js";
import { registerCreateEntryTool } from "./createEntry.js";
import { registerSearchEntriesTool } from "./searchEntries.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function setup(sql: postgres.Sql, userId: string = TEST_USER_ID) {
  const server = new McpServer({ name: "orium-mcp-test", version: "0.0.0" });
  registerCreateEntryTool(server, sql, userId);
  registerSearchEntriesTool(server, sql, userId);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return { client };
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>) {
  const content = result.content as Array<{ type: string; text: string }>;
  return content[0]!.text;
}

describe("search_entries tool", () => {
  const sql = createDatabase(TEST_DATABASE_URL);
  let client: Client;

  beforeEach(async () => {
    await sql`TRUNCATE entries, tags, entry_tags RESTART IDENTITY CASCADE`;
    await ensureTestUsers(sql);
    ({ client } = await setup(sql));

    await client.callTool({
      name: "create_entry",
      arguments: {
        date: "2026-07-20",
        mood_rating: 4,
        energy_level: 4,
        notes: "Had a rough Meeting with the team today",
        tags: ["work"],
      },
    });
    await client.callTool({
      name: "create_entry",
      arguments: {
        date: "2026-07-21",
        mood_rating: 8,
        energy_level: 7,
        notes: "Great walk in the park, felt grateful",
      },
    });
    await client.callTool({
      name: "create_entry",
      arguments: {
        date: "2026-07-22",
        mood_rating: 6,
        energy_level: 6,
      },
    });
  });

  afterAll(async () => {
    await sql.end();
  });

  it("finds matches case-insensitively and includes tags", async () => {
    const result = await client.callTool({
      name: "search_entries",
      arguments: { keyword: "meeting" },
    });
    const body = JSON.parse(textOf(result));

    expect(body.count).toBe(1);
    expect(body.entries[0]).toMatchObject({
      date: "2026-07-20",
      tags: ["work"],
    });
  });

  it("matches an entry by its tag name, even when the keyword isn't in the notes", async () => {
    const result = await client.callTool({
      name: "search_entries",
      arguments: { keyword: "work" },
    });
    const body = JSON.parse(textOf(result));

    expect(body.count).toBe(1);
    expect(body.entries[0]).toMatchObject({ date: "2026-07-20", tags: ["work"] });
  });

  it("doesn't double-count an entry that matches both its notes and a tag", async () => {
    await client.callTool({
      name: "create_entry",
      arguments: {
        date: "2026-07-24",
        mood_rating: 7,
        energy_level: 7,
        notes: "feeling calm today",
        tags: ["calm"],
      },
    });

    const result = await client.callTool({
      name: "search_entries",
      arguments: { keyword: "calm" },
    });
    const body = JSON.parse(textOf(result));

    expect(body.count).toBe(1);
  });

  it("orders matches by date descending", async () => {
    await client.callTool({
      name: "create_entry",
      arguments: {
        date: "2026-07-18",
        mood_rating: 5,
        energy_level: 5,
        notes: "another grateful moment",
      },
    });

    const result = await client.callTool({
      name: "search_entries",
      arguments: { keyword: "grateful" },
    });
    const body = JSON.parse(textOf(result));

    expect(body.entries.map((e: { date: string }) => e.date)).toEqual([
      "2026-07-21",
      "2026-07-18",
    ]);
  });

  it("returns a friendly message when nothing matches", async () => {
    const result = await client.callTool({
      name: "search_entries",
      arguments: { keyword: "nonexistent" },
    });

    expect(textOf(result)).toBe('No entries found matching "nonexistent".');
  });

  it("treats % and _ in the keyword as literal characters", async () => {
    const result = await client.callTool({
      name: "search_entries",
      arguments: { keyword: "100%" },
    });

    expect(textOf(result)).toBe('No entries found matching "100%".');
  });

  it("rejects an empty keyword", async () => {
    const result = await client.callTool({
      name: "search_entries",
      arguments: { keyword: "" },
    });

    expect(result.isError).toBe(true);
  });

  it("never returns another user's entries", async () => {
    const { client: otherClient } = await setup(sql, OTHER_TEST_USER_ID);
    await otherClient.callTool({
      name: "create_entry",
      arguments: {
        date: "2026-07-23",
        mood_rating: 5,
        energy_level: 5,
        notes: "a secret meeting note",
      },
    });

    const result = await client.callTool({
      name: "search_entries",
      arguments: { keyword: "meeting" },
    });
    const body = JSON.parse(textOf(result));

    expect(body.count).toBe(1);
    expect(body.entries[0].date).toBe("2026-07-20");
  });
});
