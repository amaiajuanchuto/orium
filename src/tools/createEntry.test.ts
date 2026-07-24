import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../db/connection.js";
import { registerCreateEntryTool } from "./createEntry.js";
import type Database from "better-sqlite3";

async function setup() {
  const db = createDatabase(":memory:");
  const server = new McpServer({ name: "orium-mcp-test", version: "0.0.0" });
  registerCreateEntryTool(server, db);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return { db, client };
}

describe("create_entry tool", () => {
  let db: Database.Database;
  let client: Client;

  beforeEach(async () => {
    ({ db, client } = await setup());
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

    const row = db.prepare("SELECT * FROM entries WHERE id = ?").get(entry.id);
    expect(row).toBeDefined();
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

    const tagNames = db
      .prepare(
        `SELECT t.name FROM tags t
         JOIN entry_tags et ON et.tag_id = t.id
         WHERE et.entry_id = ?
         ORDER BY t.name`,
      )
      .all(entry.id)
      .map((r) => (r as { name: string }).name);

    expect(tagNames).toEqual(["grateful", "tired"]);
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
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
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
