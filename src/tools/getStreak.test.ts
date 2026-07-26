import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../db/connection.js";
import { registerCreateEntryTool } from "./createEntry.js";
import { registerGetStreakTool } from "./getStreak.js";
import type Database from "better-sqlite3";

async function setup() {
  const db = createDatabase(":memory:");
  const server = new McpServer({ name: "orium-mcp-test", version: "0.0.0" });
  registerCreateEntryTool(server, db);
  registerGetStreakTool(server, db);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return { db, client };
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
  let db: Database.Database;
  let client: Client;

  beforeEach(async () => {
    ({ db, client } = await setup());
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
    const insert = db.prepare(
      "INSERT INTO entries (date, mood_rating, energy_level) VALUES (?, 5, 5)",
    );
    for (let i = 0; i < 365; i++) {
      insert.run(daysAgo(i));
    }

    const result = await client.callTool({ name: "get_streak", arguments: {} });
    const body = JSON.parse(textOf(result));

    expect(body.current_streak).toBe(365);
    expect(body.next_milestone).toBeNull();
    expect(body.days_until_next_milestone).toBeNull();
    expect(body.message).toBe("You're on a 365-day streak!");
  });
});
