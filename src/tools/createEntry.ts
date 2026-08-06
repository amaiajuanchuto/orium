/**
 * `create_entry` MCP tool: inserts a new journal entry and its tags.
 */
import type postgres from "postgres";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createEntry } from "../core/entries.js";
import { dateSchema } from "../db/validation.js";

const createEntryInputSchema = {
  date: dateSchema,
  mood_rating: z.number().int().min(1).max(10),
  energy_level: z.number().int().min(1).max(10),
  sleep_hours: z.number().min(0).max(24).optional(),
  notes: z.string().optional(),
  tags: z.array(z.string().min(1)).optional(),
};

/**
 * Registers the `create_entry` tool, which inserts a new journal entry
 * (optionally linking it to one or more tags, created on demand) and
 * returns the persisted row.
 */
export function registerCreateEntryTool(
  server: McpServer,
  sql: postgres.Sql,
  userId: string,
): void {
  server.registerTool(
    "create_entry",
    {
      title: "Create journal entry",
      description:
        "Create a new mental health journal entry with mood, energy, sleep, and notes.",
      inputSchema: createEntryInputSchema,
    },
    async (input) => {
      const entry = await createEntry(sql, userId, input);

      return {
        content: [{ type: "text", text: JSON.stringify(entry, null, 2) }],
      };
    },
  );
}
