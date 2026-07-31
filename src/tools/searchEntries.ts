/**
 * `search_entries` MCP tool: keyword search across entry notes.
 */
import type postgres from "postgres";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Entry, EntryWithTags } from "../db/types.js";

const searchEntriesInputSchema = {
  keyword: z.string().min(1).max(200),
};

const MAX_RESULTS = 50;

/**
 * Escapes Postgres `LIKE` wildcard characters (`%`, `_`, `\`) in `value` so
 * it can be safely embedded in a `LIKE ... ESCAPE '\'` pattern as a literal
 * substring match.
 *
 * @param value - Raw user-provided search keyword.
 * @returns `value` with wildcard characters backslash-escaped.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Registers the `search_entries` tool, which performs a case-insensitive
 * search for `keyword` across entry notes, returning matches (with their
 * tags) ordered by date descending, capped at 50 results.
 */
export function registerSearchEntriesTool(server: McpServer, sql: postgres.Sql): void {
  server.registerTool(
    "search_entries",
    {
      title: "Search journal entries",
      description: "Search journal entry notes for a keyword (case-insensitive).",
      inputSchema: searchEntriesInputSchema,
    },
    async ({ keyword }) => {
      const pattern = `%${escapeLikePattern(keyword)}%`;

      const entries = await sql<Entry[]>`
        SELECT * FROM entries
        WHERE notes IS NOT NULL AND LOWER(notes) LIKE LOWER(${pattern}) ESCAPE '\\'
        ORDER BY date DESC, id DESC
        LIMIT ${MAX_RESULTS}
      `;

      if (entries.length === 0) {
        return {
          content: [{ type: "text", text: `No entries found matching "${keyword}".` }],
        };
      }

      const entriesWithTags: EntryWithTags[] = await Promise.all(
        entries.map(async (entry) => {
          const tags = (
            await sql<{ name: string }[]>`
              SELECT t.name FROM tags t
              JOIN entry_tags et ON et.tag_id = t.id
              WHERE et.entry_id = ${entry.id}
              ORDER BY t.name
            `
          ).map((row) => row.name);

          return { ...entry, tags };
        }),
      );

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
