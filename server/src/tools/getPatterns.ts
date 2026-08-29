/**
 * `get_patterns` MCP tool: finds the strongest mood correlations across
 * sleep buckets, day of week, and tags.
 */
import type postgres from "postgres";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getPatterns } from "../core/insights.js";

/**
 * Registers the `get_patterns` tool, which surfaces the strongest
 * correlations between mood and sleep duration, day of week, and tags —
 * each with numbers and a tip — or a friendly message if there isn't
 * enough data yet.
 */
export function registerGetPatternsTool(
  server: McpServer,
  sql: postgres.Sql,
  userId: string,
): void {
  server.registerTool(
    "get_patterns",
    {
      title: "Get mood patterns",
      description:
        "Find the strongest patterns in what affects your mood: sleep duration, " +
        "day of week, and tags. Requires at least 5 entries per group, and only " +
        "surfaces a pattern if it passes a Welch's t-test at p < 0.05 — so results " +
        "are backed by an actual significance test, not just eyeballing averages.",
    },
    async () => {
      const patterns = await getPatterns(sql, userId);

      if (patterns.length === 0) {
        return {
          content: [
            {
              type: "text",
              text:
                "Not enough data yet to find patterns in what affects your mood. Keep " +
                "logging entries (especially sleep hours and tags) and check back soon!",
            },
          ],
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ patterns }, null, 2) }],
      };
    },
  );
}
