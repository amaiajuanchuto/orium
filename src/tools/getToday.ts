/**
 * `get_today` MCP tool: looks up whether today's journal entry exists.
 */
import type postgres from "postgres";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Entry, EntryWithTags } from "../db/types.js";

/**
 * Registers the `get_today` tool, which looks up the journal entry for
 * today's date (based on the system clock) and returns it with its
 * linked tags, or a friendly prompt if no entry has been logged yet.
 */
export function registerGetTodayTool(server: McpServer, sql: postgres.Sql): void {
  server.registerTool(
    "get_today",
    {
      title: "Get today's journal entry",
      description: "Look up today's journal entry, if one exists, along with its tags.",
    },
    async () => {
      const today = new Date().toISOString().slice(0, 10);

      const [entry] = await sql<Entry[]>`SELECT * FROM entries WHERE date = ${today}`;

      if (!entry) {
        return {
          content: [
            { type: "text", text: "No entry logged for today yet. How are you feeling?" },
          ],
        };
      }

      const tags = (
        await sql<{ name: string }[]>`
          SELECT t.name FROM tags t
          JOIN entry_tags et ON et.tag_id = t.id
          WHERE et.entry_id = ${entry.id}
          ORDER BY t.name
        `
      ).map((row) => row.name);

      const entryWithTags: EntryWithTags = { ...entry, tags };

      return {
        content: [{ type: "text", text: JSON.stringify(entryWithTags, null, 2) }],
      };
    },
  );
}
