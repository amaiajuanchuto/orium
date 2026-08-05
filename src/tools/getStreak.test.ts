import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type postgres from "postgres";
import { createDatabase } from "../db/connection.js";
import { ensureTestUsers, OTHER_TEST_USER_ID, TEST_USER_ID } from "../db/testUser.js";
import { registerCreateEntryTool } from "./createEntry.js";
import { registerGetStreakTool } from "./getStreak.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function setup(sql: postgres.Sql, userId: string = TEST_USER_ID) {
  const server = new McpServer({ name: "orium-mcp-test", version: "0.0.0" });
  registerCreateEntryTool(server, sql, userId);
  registerGetStreakTool(server, sql, userId);

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

describe("get_streak tool", () => {
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

  async function seedEntry(daysBack: number) {
    await client.callTool({
      name: "create_entry",
      arguments: { date: daysAgo(daysBack), mood_rating: 5, energy_level: 5 },
    });
  }

  it("returns a friendly message when there are no entries", async () => {
    const result = await client.callTool({ name: "get_streak", arguments: {} });

    expect(textOf(result)).toBe("No entries yet. Log your mood today to start a streak!");
  });

  it("reports a plain streak far from the next milestone", async () => {
    await seedEntry(0);
    await seedEntry(1);
    await seedEntry(2);

    const result = await client.callTool({ name: "get_streak", arguments: {} });
    const body = JSON.parse(textOf(result));

    expect(body.current_streak).toBe(3);
    expect(body.longest_streak).toBe(3);
    expect(body.logged_today).toBe(true);
    expect(body.next_milestone).toBe(7);
    expect(body.days_until_next_milestone).toBe(4);
    expect(body.message).toBe("You're on a 3-day streak!");
  });

  it("nudges when close to the next milestone", async () => {
    for (let i = 0; i < 6; i++) {
      await seedEntry(i);
    }

    const result = await client.callTool({ name: "get_streak", arguments: {} });
    const body = JSON.parse(textOf(result));

    expect(body.current_streak).toBe(6);
    expect(body.next_milestone).toBe(7);
    expect(body.days_until_next_milestone).toBe(1);
    expect(body.message).toBe(
      "You're on a 6-day streak! Just 1 more day to hit a 7-day streak — keep going!",
    );
  });

  it("keeps the streak alive (uncounted for today) when yesterday was logged but today wasn't", async () => {
    await seedEntry(1);
    await seedEntry(2);
    await seedEntry(3);

    const result = await client.callTool({ name: "get_streak", arguments: {} });
    const body = JSON.parse(textOf(result));

    expect(body.current_streak).toBe(3);
    expect(body.logged_today).toBe(false);
    expect(body.message).toBe(
      "You're on a 3-day streak! Log today before midnight to keep it alive.",
    );
  });

  it("resets the current streak to 0 when both today and yesterday are missing", async () => {
    await seedEntry(3);
    await seedEntry(4);

    const result = await client.callTool({ name: "get_streak", arguments: {} });
    const body = JSON.parse(textOf(result));

    expect(body.current_streak).toBe(0);
    expect(body.longest_streak).toBe(2);
    expect(body.message).toBe("No active streak yet. Log your mood today to start one!");
  });

  it("tracks the longest streak separately from a shorter current streak", async () => {
    // A 5-day streak that ended a while ago, and an isolated entry today.
    for (let i = 5; i <= 9; i++) {
      await seedEntry(i);
    }
    await seedEntry(0);

    const result = await client.callTool({ name: "get_streak", arguments: {} });
    const body = JSON.parse(textOf(result));

    expect(body.current_streak).toBe(1);
    expect(body.longest_streak).toBe(5);
    expect(body.logged_today).toBe(true);
  });

  it("returns no next milestone once the longest milestone is passed", async () => {
    const dates = Array.from({ length: 365 }, (_, i) => daysAgo(i));
    await sql`
      INSERT INTO entries (user_id, date, mood_rating, energy_level)
      SELECT ${TEST_USER_ID}, unnest(${dates}::date[]), 5, 5
    `;

    const result = await client.callTool({ name: "get_streak", arguments: {} });
    const body = JSON.parse(textOf(result));

    expect(body.current_streak).toBe(365);
    expect(body.next_milestone).toBeNull();
    expect(body.days_until_next_milestone).toBeNull();
    expect(body.message).toBe("You're on a 365-day streak!");
  });

  it("only counts this user's entries toward the streak", async () => {
    await seedEntry(0);
    const { client: otherClient } = await setup(sql, OTHER_TEST_USER_ID);
    for (let i = 0; i < 10; i++) {
      await otherClient.callTool({
        name: "create_entry",
        arguments: { date: daysAgo(i), mood_rating: 5, energy_level: 5 },
      });
    }

    const result = await client.callTool({ name: "get_streak", arguments: {} });
    const body = JSON.parse(textOf(result));

    expect(body.current_streak).toBe(1);
  });
});
