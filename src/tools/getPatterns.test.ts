import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../db/connection.js";
import { registerCreateEntryTool } from "./createEntry.js";
import { registerGetPatternsTool } from "./getPatterns.js";

async function setup() {
  const db = createDatabase(":memory:");
  const server = new McpServer({ name: "orium-mcp-test", version: "0.0.0" });
  registerCreateEntryTool(server, db);
  registerGetPatternsTool(server, db);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return { client };
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>) {
  const content = result.content as Array<{ type: string; text: string }>;
  return content[0]!.text;
}

function daysAgo(n: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - n);
  return date.toISOString().slice(0, 10);
}

describe("get_patterns tool", () => {
  let client: Client;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  async function seedEntry(
    daysBack: number,
    moodRating: number,
    options: { sleepHours?: number; tags?: string[] } = {},
  ) {
    await client.callTool({
      name: "create_entry",
      arguments: {
        date: daysAgo(daysBack),
        mood_rating: moodRating,
        energy_level: moodRating,
        ...(options.sleepHours !== undefined ? { sleep_hours: options.sleepHours } : {}),
        ...(options.tags !== undefined ? { tags: options.tags } : {}),
      },
    });
  }

  it("returns a friendly message when there is no data", async () => {
    const result = await client.callTool({ name: "get_patterns", arguments: {} });

    expect(textOf(result)).toBe(
      "Not enough data yet to find patterns in what affects your mood. Keep " +
        "logging entries (especially sleep hours and tags) and check back soon!",
    );
  });

  it("returns a friendly message when there aren't enough entries per group", async () => {
    await seedEntry(0, 8, { sleepHours: 8 });
    await seedEntry(1, 3, { sleepHours: 3 });

    const result = await client.callTool({ name: "get_patterns", arguments: {} });

    expect(textOf(result)).toContain("Not enough data yet");
  });

  it("detects a sleep pattern", async () => {
    for (let i = 0; i < 5; i++) {
      await seedEntry(i, 3, { sleepHours: 5 });
    }
    for (let i = 10; i < 15; i++) {
      await seedEntry(i, 9, { sleepHours: 8 });
    }

    const result = await client.callTool({ name: "get_patterns", arguments: {} });
    const body = JSON.parse(textOf(result));

    expect(body.patterns).toHaveLength(1);
    expect(body.patterns[0].type).toBe("sleep");
    expect(body.patterns[0].effect_size).toBe(6);
    expect(body.patterns[0].summary).toContain("8+ hours");
    expect(body.patterns[0].summary).toContain("under 6 hours");
    expect(body.patterns[0].tip).toContain("8+ hours");
  });

  it("detects a day-of-week pattern", async () => {
    for (const offset of [0, 7, 14, 21, 28]) {
      await seedEntry(offset, 3);
    }
    for (const offset of [3, 10, 17, 24, 31]) {
      await seedEntry(offset, 9);
    }

    const result = await client.callTool({ name: "get_patterns", arguments: {} });
    const body = JSON.parse(textOf(result));

    expect(body.patterns).toHaveLength(1);
    expect(body.patterns[0].type).toBe("day_of_week");
    expect(body.patterns[0].effect_size).toBe(6);
  });

  it("detects a tag pattern", async () => {
    for (let i = 0; i < 5; i++) {
      await seedEntry(i, 9, { tags: ["exercise"] });
    }
    for (let i = 10; i < 15; i++) {
      await seedEntry(i, 3);
    }

    const result = await client.callTool({ name: "get_patterns", arguments: {} });
    const body = JSON.parse(textOf(result));

    expect(body.patterns).toHaveLength(1);
    expect(body.patterns[0].type).toBe("tag");
    expect(body.patterns[0].effect_size).toBe(3);
    expect(body.patterns[0].summary).toContain('"exercise"');
  });

  it("returns only the top 3 patterns ranked by absolute effect size", async () => {
    const groups: Array<[string, number, number, number]> = [
      ["a", 9, 0, 4],
      ["b", 8, 5, 9],
      ["c", 2, 10, 14],
      ["d", 5, 15, 19],
    ];

    for (const [tag, mood, from, to] of groups) {
      for (let i = from; i <= to; i++) {
        await seedEntry(i, mood, { tags: [tag] });
      }
    }

    const result = await client.callTool({ name: "get_patterns", arguments: {} });
    const body = JSON.parse(textOf(result));

    expect(body.patterns).toHaveLength(3);
    const tagsInOrder = body.patterns.map(
      (p: { summary: string }) => p.summary.match(/"(\w+)"/)?.[1],
    );
    expect(tagsInOrder).toEqual(["c", "a", "b"]);
  });
});
