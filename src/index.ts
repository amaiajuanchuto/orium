import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDatabase } from "./db/connection.js";
import { registerCreateEntryTool } from "./tools/createEntry.js";
import { registerDeleteEntryTool } from "./tools/deleteEntry.js";
import { registerGetTodayTool } from "./tools/getToday.js";
import { registerListEntriesTool } from "./tools/listEntries.js";
import { registerSearchEntriesTool } from "./tools/searchEntries.js";
import { registerUpdateEntryTool } from "./tools/updateEntry.js";

const DB_PATH = process.env.ORIUM_DB_PATH ?? "orium.db";

const db = createDatabase(DB_PATH);

const server = new McpServer({
  name: "orium-mcp",
  version: "0.1.0",
});

registerCreateEntryTool(server, db);
registerDeleteEntryTool(server, db);
registerGetTodayTool(server, db);
registerListEntriesTool(server, db);
registerSearchEntriesTool(server, db);
registerUpdateEntryTool(server, db);

process.on("exit", () => db.close());

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Fatal error starting Orium MCP server:", error);
  process.exit(1);
});
