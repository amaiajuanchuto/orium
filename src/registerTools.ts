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
 * Registers all 10 journaling tools on `server`, backed by `sql` and scoped
 * to `userId` (the authenticated Supabase user this session belongs to).
 *
 * @param server - The MCP server to register tools on.
 * @param sql - Open database connection shared across tool calls.
 * @param userId - The authenticated user's id; every tool scopes its
 *   queries to this user's own entries.
 */
export function registerAllTools(server: McpServer, sql: postgres.Sql, userId: string): void {
  registerCreateEntryTool(server, sql, userId);
  registerDeleteEntryTool(server, sql, userId);
  registerGetMoodTrendsTool(server, sql, userId);
  registerGetPatternsTool(server, sql, userId);
  registerGetStreakTool(server, sql, userId);
  registerGetSummaryTool(server, sql, userId);
  registerGetTodayTool(server, sql, userId);
  registerListEntriesTool(server, sql, userId);
  registerSearchEntriesTool(server, sql, userId);
  registerUpdateEntryTool(server, sql, userId);
}
