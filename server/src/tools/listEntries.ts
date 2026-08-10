/**
 * `list_entries` MCP tool: queries journal entries with optional filters.
 */
import type postgres from "postgres";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listEntries } from "../core/entries.js";
import { DATE_REGEX } from "../db/types.js";

const listEntriesInputSchema = {
  from: z.string().regex(DATE_REGEX, "from must be in YYYY-MM-DD format").optional(),
  to: z.string().regex(DATE_REGEX, "to must be in YYYY-MM-DD format").optional(),
  tag: z.string().min(1).optional(),
  min_mood_rating: z.number().int().min(1).max(10).optional(),
  max_mood_rating: z.number().int().min(1).max(10).optional(),
  min_energy_level: z.number().int().min(1).max(10).optional(),
  max_energy_level: z.number().int().min(1).max(10).optional(),
  limit: z.number().int().min(1).max(100).optional(),
};

/**
 * Registers the `list_entries` tool, which returns journal entries (most
 * recent first) filtered by date range, mood/energy range, and/or tag,
 * each annotated with its linked tag names.
 */
export function registerListEntriesTool(
  server: McpServer,
  sql: postgres.Sql,
  userId: string,
): void {
  server.registerTool(
    "list_entries",
    {
      title: "List journal entries",
      description:
        "List mental health journal entries, optionally filtered by date range, " +
        "mood/energy range, or tag.",
      inputSchema: listEntriesInputSchema,
    },
    async (filters) => {
      const entriesWithTags = await listEntries(sql, userId, filters);

      return {
        content: [{ type: "text", text: JSON.stringify(entriesWithTags, null, 2) }],
      };
    },
  );
}
