/**
 * `get_streak` MCP tool: reports the current/longest logging streaks and
 * progress toward the next milestone.
 */
import type postgres from "postgres";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getStreak } from "../core/insights.js";

/**
 * Registers the `get_streak` tool, which reports the current consecutive
 * daily-logging streak (broken by any missed calendar day), the longest
 * streak ever, and the next milestone with a motivational message.
 */
export function registerGetStreakTool(
  server: McpServer,
  sql: postgres.Sql,
  userId: string,
): void {
  server.registerTool(
    "get_streak",
    {
      title: "Get logging streak",
      description:
        "Report the current and longest consecutive daily journaling streaks, and " +
        "how close the user is to their next milestone.",
    },
    async () => {
      const result = await getStreak(sql, userId);

      if (!result) {
        return {
          content: [
            {
              type: "text",
              text: "No entries yet. Log your mood today to start a streak!",
            },
          ],
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
