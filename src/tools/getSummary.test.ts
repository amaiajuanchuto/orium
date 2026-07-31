import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type postgres from "postgres";
import { createDatabase } from "../db/connection.js";
import { registerCreateEntryTool } from "./createEntry.js";
import { registerGetSummaryTool } from "./getSummary.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function setup(sql: postgres.Sql) {
  const server = new McpServer({ name: "orium-mcp-test", version: "0.0.0" });
  registerCreateEntryTool(server, sql);
  registerGetSummaryTool(server, sql);

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

describe("get_summary tool", () => {
  const sql = createDatabase(TEST_DATABASE_URL);
  let client: Client;

  beforeEach(async () => {
    await sql`TRUNCATE entries, tags, entry_tags RESTART IDENTITY CASCADE`;
    ({ client } = await setup(sql));
  });

  afterAll(async () => {
    await sql.end();
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

  it("returns a friendly message when there are no entries for the period", async () => {
    const result = await client.callTool({
      name: "get_summary",
      arguments: { period: "week" },
    });

    expect(textOf(result)).toBe(
      "You haven't logged any entries this week yet. Start today and your first " +
        "summary will be waiting for you!",
    );
  });

  it("rejects an invalid period", async () => {
    const result = await client.callTool({
      name: "get_summary",
      arguments: { period: "year" },
    });

    expect(result.isError).toBe(true);
  });

  it("builds a full summary and picks the trend-up message when it's the strongest signal", async () => {
    const moods = [8, 7, 9, 6, 8, 5, 8];
    for (let i = 0; i < moods.length; i++) {
      const tags = [0, 2, 4].includes(i) ? ["work"] : undefined;
      await seedEntry(i, moods[i]!, { sleepHours: 7, tags });
    }
    await seedEntry(13, 6);

    const result = await client.callTool({
      name: "get_summary",
      arguments: { period: "week" },
    });
    const body = JSON.parse(textOf(result));

    expect(body.entry_count).toBe(7);
    expect(body.averages).toEqual({
      mood_rating: 7.3,
      energy_level: 7.3,
      sleep_hours: 7,
    });
    expect(body.trend).toEqual({
      direction: "up",
      difference: 1.3,
      current_avg_mood: 7.3,
      previous_avg_mood: 6,
    });
    expect(body.best_day).toEqual({ date: daysAgo(2), mood_rating: 9 });
    expect(body.worst_day).toEqual({ date: daysAgo(5), mood_rating: 5 });
    expect(body.top_tags).toEqual([{ tag: "work", count: 3 }]);
    expect(body.tag_impact.most_positive).toEqual({
      tag: "work",
      avg_mood: 8.3,
      difference: 1,
    });
    expect(body.current_streak).toBe(7);
    expect(body.message).toBe(
      "Your mood has improved by 1.3 points this week. Whatever you're doing, keep it up!",
    );
  });

  it("picks the trend-down message when mood dropped and nothing else qualifies", async () => {
    await seedEntry(0, 3);
    await seedEntry(1, 3);
    await seedEntry(2, 3);
    await seedEntry(7, 7);
    await seedEntry(8, 7);

    const result = await client.callTool({
      name: "get_summary",
      arguments: { period: "week" },
    });
    const body = JSON.parse(textOf(result));

    expect(body.trend.direction).toBe("down");
    expect(body.current_streak).toBe(3);
    expect(body.message).toBe(
      "It's been a tough week, but you're still showing up and logging. That consistency matters.",
    );
  });

  it("picks the tag-impact message when a tag stands out and nothing else qualifies", async () => {
    await seedEntry(0, 6);
    await seedEntry(1, 6);
    await seedEntry(2, 6);
    await seedEntry(3, 6);
    await seedEntry(4, 10, { tags: ["exercise"] });

    const result = await client.callTool({
      name: "get_summary",
      arguments: { period: "week" },
    });
    const body = JSON.parse(textOf(result));

    expect(body.trend.direction).toBe("stable");
    expect(body.tag_impact.most_positive).toEqual({
      tag: "exercise",
      avg_mood: 10,
      difference: 3.2,
    });
    expect(body.current_streak).toBe(5);
    expect(body.message).toBe(
      'Days you tagged "exercise" averaged 3.2 points higher than your overall average. Keep it going!',
    );
  });

  it("picks the streak message when the streak is the only qualifying signal", async () => {
    for (let i = 0; i < 7; i++) {
      await seedEntry(i, 6);
    }

    const result = await client.callTool({
      name: "get_summary",
      arguments: { period: "week" },
    });
    const body = JSON.parse(textOf(result));

    expect(body.current_streak).toBe(7);
    expect(body.trend.direction).toBe("stable");
    expect(body.message).toBe(
      "7 days in a row! Showing up for yourself is a superpower.",
    );
  });

  it("falls back to a neutral entry-count message when no signal qualifies", async () => {
    await seedEntry(0, 6);
    await seedEntry(1, 6);
    await seedEntry(2, 6);

    const result = await client.callTool({
      name: "get_summary",
      arguments: { period: "week" },
    });
    const body = JSON.parse(textOf(result));

    expect(body.message).toBe(
      "You logged 3 entries this week. Keep showing up for yourself.",
    );
  });

  it("works for the month period", async () => {
    await seedEntry(0, 8);
    await seedEntry(29, 8);
    await seedEntry(35, 5);

    const result = await client.callTool({
      name: "get_summary",
      arguments: { period: "month" },
    });
    const body = JSON.parse(textOf(result));

    expect(body.period).toBe("month");
    expect(body.entry_count).toBe(2);
  });
});
