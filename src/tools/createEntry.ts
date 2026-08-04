/**
 * `create_entry` MCP tool: inserts a new journal entry and its tags.
 */
import type postgres from "postgres";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { upsertTag } from "../db/tags.js";
import type { Entry } from "../db/types.js";
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
    async ({ date, mood_rating, energy_level, sleep_hours, notes, tags }) => {
      const entry = await sql.begin(async (tx) => {
        const [row] = await tx<Entry[]>`
          INSERT INTO entries (user_id, date, mood_rating, energy_level, sleep_hours, notes)
          VALUES (${userId}, ${date}, ${mood_rating}, ${energy_level}, ${sleep_hours ?? null}, ${notes ?? null})
          RETURNING *
        `;
        const entryId = row!.id;

        for (const tagName of tags ?? []) {
          const tagId = await upsertTag(tx, tagName);
          await tx`
            INSERT INTO entry_tags (entry_id, tag_id)
            VALUES (${entryId}, ${tagId})
            ON CONFLICT DO NOTHING
          `;
        }

        return row!;
      });

      return {
        content: [{ type: "text", text: JSON.stringify(entry, null, 2) }],
      };
    },
  );
}
