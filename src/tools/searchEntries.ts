import type Database from "better-sqlite3";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Entry, EntryWithTags } from "../db/types.js";

const searchEntriesInputSchema = {
  keyword: z.string().min(1).max(200),
};

const MAX_RESULTS = 50;

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Registers the `search_entries` tool, which performs a case-insensitive
 * search for `keyword` across entry notes, returning matches (with their
 * tags) ordered by date descending, capped at 50 results.
 */
export function registerSearchEntriesTool(
  server: McpServer,
  db: Database.Database,
): void {
  server.registerTool(
    "search_entries",
    {
      title: "Search journal entries",
      description: "Search journal entry notes for a keyword (case-insensitive).",
      inputSchema: searchEntriesInputSchema,
    },
    ({ keyword }) => {
      const pattern = `%${escapeLikePattern(keyword)}%`;

      const entries = db
        .prepare(
          `SELECT * FROM entries
           WHERE notes IS NOT NULL AND LOWER(notes) LIKE LOWER(?) ESCAPE '\\'
           ORDER BY date DESC, id DESC
           LIMIT ?`,
        )
        .all(pattern, MAX_RESULTS) as Entry[];

      if (entries.length === 0) {
        return {
          content: [{ type: "text", text: `No entries found matching "${keyword}".` }],
        };
      }

      const tagsForEntry = db.prepare(
        `SELECT t.name FROM tags t
         JOIN entry_tags et ON et.tag_id = t.id
         WHERE et.entry_id = ?
         ORDER BY t.name`,
      );

      const entriesWithTags: EntryWithTags[] = entries.map((entry) => ({
        ...entry,
        tags: tagsForEntry.all(entry.id).map((row) => (row as { name: string }).name),
      }));

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
