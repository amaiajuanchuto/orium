/**
 * Registers every Orium journaling tool on an MCP server instance.
 */
import type postgres from "postgres";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreateEntryTool } from "./tools/createEntry.js";
import { registerDeleteEntryTool } from "./tools/deleteEntry.js";
import { registerGetMoodTrendsTool } from "./tools/getMoodTrends.js";
import { registerGetPatternsTool } from "./tools/getPatterns.js";
import { registerGetStreakTool } from "./tools/getStreak.js";
import { registerGetSummaryTool } from "./tools/getSummary.js";
import { registerGetTodayTool } from "./tools/getToday.js";
import { registerListEntriesTool } from "./tools/listEntries.js";
import { registerSearchEntriesTool } from "./tools/searchEntries.js";
import { registerUpdateEntryTool } from "./tools/updateEntry.js";

/**
 * Registers all 10 journaling tools on `server`, backed by `sql`.
 *
 * @param server - The MCP server to register tools on.
 * @param sql - Open database connection shared across tool calls.
 */
export function registerAllTools(server: McpServer, sql: postgres.Sql): void {
  registerCreateEntryTool(server, sql);
  registerDeleteEntryTool(server, sql);
  registerGetMoodTrendsTool(server, sql);
  registerGetPatternsTool(server, sql);
  registerGetStreakTool(server, sql);
  registerGetSummaryTool(server, sql);
  registerGetTodayTool(server, sql);
  registerListEntriesTool(server, sql);
  registerSearchEntriesTool(server, sql);
  registerUpdateEntryTool(server, sql);
}
