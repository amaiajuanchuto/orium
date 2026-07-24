import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../db/connection.js";
import { registerCreateEntryTool } from "./createEntry.js";
import { registerSearchEntriesTool } from "./searchEntries.js";

async function setup() {
  const db = createDatabase(":memory:");
  const server = new McpServer({ name: "orium-mcp-test", version: "0.0.0" });
  registerCreateEntryTool(server, db);
  registerSearchEntriesTool(server, db);

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
  let client: Client;

  beforeEach(async () => {
    ({ client } = await setup());

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
});
