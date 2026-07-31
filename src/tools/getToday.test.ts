import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type postgres from "postgres";
import { createDatabase } from "../db/connection.js";
import { registerCreateEntryTool } from "./createEntry.js";
import { registerGetTodayTool } from "./getToday.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function setup(sql: postgres.Sql) {
  const server = new McpServer({ name: "orium-mcp-test", version: "0.0.0" });
  registerCreateEntryTool(server, sql);
  registerGetTodayTool(server, sql);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return { client };
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>) {
  const content = result.content as Array<{ type: string; text: string }>;
  return content[0]!.text;
}

describe("get_today tool", () => {
  const sql = createDatabase(TEST_DATABASE_URL);
  let client: Client;

  beforeEach(async () => {
    await sql`TRUNCATE entries, tags, entry_tags RESTART IDENTITY CASCADE`;
    ({ client } = await setup(sql));
  });

  afterAll(async () => {
    await sql.end();
  });

  it("returns a friendly message when no entry exists for today", async () => {
    const result = await client.callTool({ name: "get_today", arguments: {} });

    expect(textOf(result)).toBe("No entry logged for today yet. How are you feeling?");
  });

  it("returns today's entry with its tags when one exists", async () => {
    const today = new Date().toISOString().slice(0, 10);

    await client.callTool({
      name: "create_entry",
      arguments: {
        date: today,
        mood_rating: 6,
        energy_level: 7,
        notes: "steady day",
        tags: ["calm"],
      },
    });

    const result = await client.callTool({ name: "get_today", arguments: {} });
    const entry = JSON.parse(textOf(result));

    expect(entry).toMatchObject({
      date: today,
      mood_rating: 6,
      energy_level: 7,
      notes: "steady day",
      tags: ["calm"],
    });
  });
});
