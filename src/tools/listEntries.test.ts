import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../db/connection.js";
import { registerCreateEntryTool } from "./createEntry.js";
import { registerListEntriesTool } from "./listEntries.js";

async function setup() {
  const db = createDatabase(":memory:");
  const server = new McpServer({ name: "orium-mcp-test", version: "0.0.0" });
  registerCreateEntryTool(server, db);
  registerListEntriesTool(server, db);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return { db, client };
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>) {
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0]!.text);
}

describe("list_entries tool", () => {
  let client: Client;

  beforeEach(async () => {
    ({ client } = await setup());

    await client.callTool({
      name: "create_entry",
      arguments: {
        date: "2026-07-20",
        mood_rating: 3,
        energy_level: 4,
        tags: ["tired"],
      },
    });
    await client.callTool({
      name: "create_entry",
      arguments: {
        date: "2026-07-21",
        mood_rating: 8,
        energy_level: 7,
        tags: ["grateful"],
      },
    });
    await client.callTool({
      name: "create_entry",
      arguments: {
        date: "2026-07-22",
        mood_rating: 5,
        energy_level: 5,
      },
    });
  });

  it("returns entries most recent first with their tags", async () => {
    const result = await client.callTool({ name: "list_entries", arguments: {} });
    const entries = textOf(result);

    expect(entries.map((e: { date: string }) => e.date)).toEqual([
      "2026-07-22",
      "2026-07-21",
      "2026-07-20",
    ]);
    expect(entries[1].tags).toEqual(["grateful"]);
    expect(entries[2].tags).toEqual(["tired"]);
  });

  it("filters by date range", async () => {
    const result = await client.callTool({
      name: "list_entries",
      arguments: { from: "2026-07-21", to: "2026-07-22" },
    });
    const entries = textOf(result);

    expect(entries.map((e: { date: string }) => e.date)).toEqual([
      "2026-07-22",
      "2026-07-21",
    ]);
  });

  it("filters by mood range", async () => {
    const result = await client.callTool({
      name: "list_entries",
      arguments: { min_mood_rating: 6 },
    });
    const entries = textOf(result);

    expect(entries.map((e: { date: string }) => e.date)).toEqual(["2026-07-21"]);
  });

  it("filters by tag", async () => {
    const result = await client.callTool({
      name: "list_entries",
      arguments: { tag: "Tired" },
    });
    const entries = textOf(result);

    expect(entries.map((e: { date: string }) => e.date)).toEqual(["2026-07-20"]);
  });

  it("respects the limit parameter", async () => {
    const result = await client.callTool({
      name: "list_entries",
      arguments: { limit: 1 },
    });
    const entries = textOf(result);

    expect(entries).toHaveLength(1);
    expect(entries[0].date).toBe("2026-07-22");
  });
});
