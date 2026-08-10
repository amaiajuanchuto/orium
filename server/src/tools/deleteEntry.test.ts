import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type postgres from "postgres";
import { createDatabase } from "../db/connection.js";
import { ensureTestUsers, OTHER_TEST_USER_ID, TEST_USER_ID } from "../db/testUser.js";
import { registerCreateEntryTool } from "./createEntry.js";
import { registerDeleteEntryTool } from "./deleteEntry.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function setup(sql: postgres.Sql, userId: string = TEST_USER_ID) {
  const server = new McpServer({ name: "orium-mcp-test", version: "0.0.0" });
  registerCreateEntryTool(server, sql, userId);
  registerDeleteEntryTool(server, sql, userId);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return { client };
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>) {
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0]!.text);
}

describe("delete_entry tool", () => {
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
        tags: ["tired"],
      },
    });
    return textOf(result);
  }

  it("deletes the entry and confirms with its date", async () => {
    const seed = await createSeedEntry();

    const result = await client.callTool({
      name: "delete_entry",
      arguments: { id: seed.id },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]!.text).toContain("2026-07-20");

    const [row] = await sql`SELECT * FROM entries WHERE id = ${seed.id}`;
    expect(row).toBeUndefined();
  });

  it("cascades the delete to entry_tags", async () => {
    const seed = await createSeedEntry();

    await client.callTool({
      name: "delete_entry",
      arguments: { id: seed.id },
    });

    const [remainingLinks] = await sql<
      { count: number }[]
    >`SELECT COUNT(*)::int AS count FROM entry_tags WHERE entry_id = ${seed.id}`;
    expect(remainingLinks!.count).toBe(0);
  });

  it("returns an error when the entry does not exist", async () => {
    const result = await client.callTool({
      name: "delete_entry",
      arguments: { id: 9999 },
    });

    expect(result.isError).toBe(true);
  });

  it("is marked as destructive", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "delete_entry");

    expect(tool?.annotations?.destructiveHint).toBe(true);
  });

  it("cannot delete another user's entry", async () => {
    const seed = await createSeedEntry();
    const { client: otherClient } = await setup(sql, OTHER_TEST_USER_ID);

    const result = await otherClient.callTool({
      name: "delete_entry",
      arguments: { id: seed.id },
    });

    expect(result.isError).toBe(true);

    const [row] = await sql`SELECT * FROM entries WHERE id = ${seed.id}`;
    expect(row).toBeDefined();
  });
});
