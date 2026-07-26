import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../db/connection.js";
import { registerCreateEntryTool } from "./createEntry.js";
import { registerGetMoodTrendsTool } from "./getMoodTrends.js";

async function setup() {
  const db = createDatabase(":memory:");
  const server = new McpServer({ name: "orium-mcp-test", version: "0.0.0" });
  registerCreateEntryTool(server, db);
  registerGetMoodTrendsTool(server, db);

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

describe("get_mood_trends tool", () => {
  let client: Client;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  async function seedEntry(daysBack: number, moodRating: number, energyLevel: number) {
    await client.callTool({
      name: "create_entry",
      arguments: {
        date: daysAgo(daysBack),
        mood_rating: moodRating,
        energy_level: energyLevel,
        sleep_hours: 7,
      },
    });
  }

  it("returns a friendly message when there is no data for the period", async () => {
    const result = await client.callTool({
      name: "get_mood_trends",
      arguments: { period: "week" },
    });

    expect(textOf(result)).toBe(
      "Not enough data yet for this period. Log a few entries and check back!",
    );
  });

  it("reports an upward trend when current mood/energy rose over 0.5", async () => {
    await seedEntry(1, 8, 8);
    await seedEntry(3, 6, 6);
    await seedEntry(8, 4, 4);
    await seedEntry(10, 4, 4);

    const result = await client.callTool({
      name: "get_mood_trends",
      arguments: { period: "week" },
    });
    const body = JSON.parse(textOf(result));

    expect(body.current_period.mood_rating).toBe(7);
    expect(body.current_period.energy_level).toBe(7);
    expect(body.current_period.entry_count).toBe(2);
    expect(body.previous_period.mood_rating).toBe(4);
    expect(body.previous_period.entry_count).toBe(2);
    expect(body.mood_direction).toBe("up");
    expect(body.energy_direction).toBe("up");
  });

  it("reports a downward trend when current mood/energy dropped over 0.5", async () => {
    await seedEntry(1, 3, 3);
    await seedEntry(8, 8, 8);

    const result = await client.callTool({
      name: "get_mood_trends",
      arguments: { period: "week" },
    });
    const body = JSON.parse(textOf(result));

    expect(body.mood_direction).toBe("down");
    expect(body.energy_direction).toBe("down");
  });

  it("reports stable when the change is within 0.5", async () => {
    await seedEntry(1, 5, 5);
    await seedEntry(8, 5.2, 5.2);

    const result = await client.callTool({
      name: "get_mood_trends",
      arguments: { period: "week" },
    });
    const body = JSON.parse(textOf(result));

    expect(body.mood_direction).toBe("stable");
    expect(body.energy_direction).toBe("stable");
  });

  it("returns null previous averages and stable direction when there is no prior data", async () => {
    await seedEntry(1, 7, 7);

    const result = await client.callTool({
      name: "get_mood_trends",
      arguments: { period: "week" },
    });
    const body = JSON.parse(textOf(result));

    expect(body.previous_period.mood_rating).toBeNull();
    expect(body.previous_period.entry_count).toBe(0);
    expect(body.mood_direction).toBe("stable");
    expect(body.energy_direction).toBe("stable");
  });

  it("rejects an invalid period", async () => {
    const result = await client.callTool({
      name: "get_mood_trends",
      arguments: { period: "year" },
    });

    expect(result.isError).toBe(true);
  });
});
