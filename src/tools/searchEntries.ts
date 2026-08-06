/**
 * `search_entries` MCP tool: keyword search across entry notes.
 */
import type postgres from "postgres";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchEntries } from "../core/entries.js";

const searchEntriesInputSchema = {
  keyword: z.string().min(1).max(200),
};

/**
 * Registers the `search_entries` tool, which performs a case-insensitive
 * search for `keyword` across entry notes, returning matches (with their
 * tags) ordered by date descending, capped at 50 results.
 */
export function registerSearchEntriesTool(
  server: McpServer,
  sql: postgres.Sql,
  userId: string,
): void {
  server.registerTool(
    "search_entries",
    {
      title: "Search journal entries",
      description: "Search journal entry notes for a keyword (case-insensitive).",
      inputSchema: searchEntriesInputSchema,
    },
    async ({ keyword }) => {
      const entriesWithTags = await searchEntries(sql, userId, keyword);

      if (entriesWithTags.length === 0) {
        return {
          content: [{ type: "text", text: `No entries found matching "${keyword}".` }],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { count: entriesWithTags.length, entries: entriesWithTags },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
