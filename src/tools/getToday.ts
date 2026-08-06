/**
 * `get_today` MCP tool: looks up whether today's journal entry exists.
 */
import type postgres from "postgres";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getTodayEntry } from "../core/entries.js";

/**
 * Registers the `get_today` tool, which looks up the journal entry for
 * today's date (based on the system clock) and returns it with its
 * linked tags, or a friendly prompt if no entry has been logged yet.
 */
export function registerGetTodayTool(
  server: McpServer,
  sql: postgres.Sql,
  userId: string,
): void {
  server.registerTool(
    "get_today",
    {
      title: "Get today's journal entry",
      description: "Look up today's journal entry, if one exists, along with its tags.",
    },
    async () => {
      const entry = await getTodayEntry(sql, userId);

      if (!entry) {
        return {
          content: [
            { type: "text", text: "No entry logged for today yet. How are you feeling?" },
          ],
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(entry, null, 2) }],
      };
    },
  );
}
