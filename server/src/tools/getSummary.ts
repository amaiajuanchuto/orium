/**
 * `get_summary` MCP tool: Orium's comprehensive week/month review,
 * combining averages, trend, best/worst days, tags, and streak.
 */
import type postgres from "postgres";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSummary } from "../core/insights.js";

const getSummaryInputSchema = {
  period: z.enum(["week", "month"]),
};

/**
 * Registers the `get_summary` tool: Orium's comprehensive period review,
 * combining averages, trend, best/worst days, top tags, tag impact, and
 * streak into one data-driven summary with a personalized message.
 */
export function registerGetSummaryTool(
  server: McpServer,
  sql: postgres.Sql,
  userId: string,
): void {
  server.registerTool(
    "get_summary",
    {
      title: "Get period summary",
      description:
        "Get a comprehensive review of the last week or month: averages, mood " +
        "trend, best/worst days, top tags, tag impact, streak, and a personalized message.",
      inputSchema: getSummaryInputSchema,
    },
    async ({ period }) => {
      const result = await getSummary(sql, userId, period);

      if (!result) {
        return {
          content: [
            {
              type: "text",
              text: `You haven't logged any entries this ${period} yet. Start today and your first summary will be waiting for you!`,
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
