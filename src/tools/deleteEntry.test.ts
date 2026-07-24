import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../db/connection.js";
import { registerCreateEntryTool } from "./createEntry.js";
import { registerDeleteEntryTool } from "./deleteEntry.js";
import type Database from "better-sqlite3";

async function setup() {
  const db = createDatabase(":memory:");
  const server = new McpServer({ name: "orium-mcp-test", version: "0.0.0" });
  registerCreateEntryTool(server, db);
  registerDeleteEntryTool(server, db);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return { db, client };
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>) {
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0]!.text);
}

describe("delete_entry tool", () => {
  let db: Database.Database;
  let client: Client;

  beforeEach(async () => {
    ({ db, client } = await setup());
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

    const row = db.prepare("SELECT * FROM entries WHERE id = ?").get(seed.id);
    expect(row).toBeUndefined();
  });

  it("cascades the delete to entry_tags", async () => {
    const seed = await createSeedEntry();

    await client.callTool({
      name: "delete_entry",
      arguments: { id: seed.id },
    });

    const remainingLinks = db
      .prepare("SELECT COUNT(*) AS count FROM entry_tags WHERE entry_id = ?")
      .get(seed.id) as { count: number };
    expect(remainingLinks.count).toBe(0);
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
});
