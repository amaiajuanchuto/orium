import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../db/connection.js";
import { registerCreateEntryTool } from "./createEntry.js";
import { registerUpdateEntryTool } from "./updateEntry.js";
import type Database from "better-sqlite3";

async function setup() {
  const db = createDatabase(":memory:");
  const server = new McpServer({ name: "orium-mcp-test", version: "0.0.0" });
  registerCreateEntryTool(server, db);
  registerUpdateEntryTool(server, db);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return { db, client };
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>) {
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0]!.text);
}

describe("update_entry tool", () => {
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

    const row = db
      .prepare("SELECT created_at, updated_at FROM entries WHERE id = ?")
      .get(seed.id) as { created_at: string; updated_at: string };

    expect(updated.notes).toBe("new notes");
    expect(row.updated_at).toBeDefined();
  });

  it("replaces tags entirely when tags is provided", async () => {
    const seed = await createSeedEntry();

    const result = await client.callTool({
      name: "update_entry",
      arguments: { id: seed.id, tags: ["grateful", "hopeful"] },
    });
    const updated = textOf(result);

    expect(updated.tags).toEqual(["grateful", "hopeful"]);

    const remainingLinks = db
      .prepare("SELECT COUNT(*) AS count FROM entry_tags WHERE entry_id = ?")
      .get(seed.id) as { count: number };
    expect(remainingLinks.count).toBe(2);
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
});
