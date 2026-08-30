import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type postgres from "postgres";
import { createDatabase } from "../db/connection.js";
import { ensureTestUsers, OTHER_TEST_USER_ID, TEST_USER_ID } from "../db/testUser.js";
import { registerCreateEntryTool } from "./createEntry.js";
import { registerUpdateEntryTool } from "./updateEntry.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function setup(sql: postgres.Sql, userId: string = TEST_USER_ID) {
  const server = new McpServer({ name: "orium-mcp-test", version: "0.0.0" });
  registerCreateEntryTool(server, sql, userId);
  registerUpdateEntryTool(server, sql, userId);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return { client };
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>) {
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0]!.text);
}

describe("update_entry tool", () => {
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

  async function createSeedEntry() {
    const result = await client.callTool({
      name: "create_entry",
      arguments: {
        date: "2026-07-20",
        mood_rating: 5,
        energy_level: 5,
        sleep_hours: 6,
        notes: "original notes",
        tags: ["tired"],
      },
    });
    return textOf(result);
  }

  it("updates only the provided fields", async () => {
    const seed = await createSeedEntry();

    const result = await client.callTool({
      name: "update_entry",
      arguments: { id: seed.id, mood_rating: 9 },
    });
    const updated = textOf(result);

    expect(updated).toMatchObject({
      id: seed.id,
      date: "2026-07-20",
      mood_rating: 9,
      energy_level: 5,
      sleep_hours: 6,
      notes: "original notes",
      tags: ["tired"],
    });
  });

  it("bumps updated_at", async () => {
    const seed = await createSeedEntry();

    const result = await client.callTool({
      name: "update_entry",
      arguments: { id: seed.id, notes: "new notes" },
    });
    const updated = textOf(result);

    const [row] = await sql<
      { created_at: string; updated_at: string }[]
    >`SELECT created_at, updated_at FROM entries WHERE id = ${seed.id}`;

    expect(updated.notes).toBe("new notes");
    expect(row!.updated_at).toBeDefined();
  });

  it("bumps updated_at on a tags-only update", async () => {
    const seed = await createSeedEntry();

    const [before] = await sql<
      { updated_at: string }[]
    >`SELECT updated_at FROM entries WHERE id = ${seed.id}`;

    await new Promise((resolve) => setTimeout(resolve, 10));

    await client.callTool({
      name: "update_entry",
      arguments: { id: seed.id, tags: ["grateful"] },
    });

    const [after] = await sql<
      { updated_at: string }[]
    >`SELECT updated_at FROM entries WHERE id = ${seed.id}`;

    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
      new Date(before!.updated_at).getTime(),
    );
  });

  it("replaces tags entirely when tags is provided", async () => {
    const seed = await createSeedEntry();

    const result = await client.callTool({
      name: "update_entry",
      arguments: { id: seed.id, tags: ["grateful", "hopeful"] },
    });
    const updated = textOf(result);

    expect(updated.tags).toEqual(["grateful", "hopeful"]);

    const [remainingLinks] = await sql<
      { count: number }[]
    >`SELECT COUNT(*)::int AS count FROM entry_tags WHERE entry_id = ${seed.id}`;
    expect(remainingLinks!.count).toBe(2);
  });

  it("leaves tags unchanged when tags is omitted", async () => {
    const seed = await createSeedEntry();

    const result = await client.callTool({
      name: "update_entry",
      arguments: { id: seed.id, mood_rating: 4 },
    });
    const updated = textOf(result);

    expect(updated.tags).toEqual(["tired"]);
  });

  it("returns an error when the entry does not exist", async () => {
    const result = await client.callTool({
      name: "update_entry",
      arguments: { id: 9999, mood_rating: 5 },
    });

    expect(result.isError).toBe(true);
  });

  it("returns an error when moved onto a date that already has an entry", async () => {
    const seed = await createSeedEntry();
    await client.callTool({
      name: "create_entry",
      arguments: { date: "2026-07-21", mood_rating: 5, energy_level: 5 },
    });

    const result = await client.callTool({
      name: "update_entry",
      arguments: { id: seed.id, date: "2026-07-21" },
    });

    expect(result.isError).toBe(true);
  });

  it("rejects an out-of-range mood_rating", async () => {
    const seed = await createSeedEntry();

    const result = await client.callTool({
      name: "update_entry",
      arguments: { id: seed.id, mood_rating: 0 },
    });

    expect(result.isError).toBe(true);
  });

  it("rejects a date in the future", async () => {
    const seed = await createSeedEntry();
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const result = await client.callTool({
      name: "update_entry",
      arguments: { id: seed.id, date: futureDate },
    });

    expect(result.isError).toBe(true);
  });

  it("cannot update another user's entry", async () => {
    const seed = await createSeedEntry();
    const { client: otherClient } = await setup(sql, OTHER_TEST_USER_ID);

    const result = await otherClient.callTool({
      name: "update_entry",
      arguments: { id: seed.id, mood_rating: 1 },
    });

    expect(result.isError).toBe(true);

    const [row] = await sql`SELECT mood_rating FROM entries WHERE id = ${seed.id}`;
    expect(row!.mood_rating).toBe(5);
  });
});
