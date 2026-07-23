import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDatabase } from "./db/connection.js";

const DB_PATH = process.env.ORIUM_DB_PATH ?? "orium.db";

const db = createDatabase(DB_PATH);

const server = new McpServer({
  name: "orium-mcp",
  version: "0.1.0",
});

process.on("exit", () => db.close());

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Fatal error starting Orium MCP server:", error);
  process.exit(1);
});
