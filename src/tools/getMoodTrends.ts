/**
 * `get_mood_trends` MCP tool: compares recent averages against the prior
 * equivalent period.
 */
import type postgres from "postgres";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getMoodTrends } from "../core/insights.js";

const getMoodTrendsInputSchema = {
  period: z.enum(["week", "month", "quarter"]),
};

/**
 * Registers the `get_mood_trends` tool, which compares average mood,
 * energy, and sleep over the last 7/30/90 days against the equivalent
 * prior period.
 */
export function registerGetMoodTrendsTool(
  server: McpServer,
  sql: postgres.Sql,
  userId: string,
): void {
  server.registerTool(
    "get_mood_trends",
    {
      title: "Get mood trends",
      description:
        "Compare average mood, energy, and sleep over the last week, month, or " +
        "quarter against the equivalent prior period.",
      inputSchema: getMoodTrendsInputSchema,
    },
    async ({ period }) => {
      const result = await getMoodTrends(sql, userId, period);

      if (!result) {
        return {
          content: [
            {
              type: "text",
              text: "Not enough data yet for this period. Log a few entries and check back!",
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
