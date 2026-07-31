/**
 * Orium MCP server entry point. Opens the Postgres database and serves every
 * journaling tool over the MCP Streamable HTTP transport, protected by a
 * shared bearer token.
 */
import { randomUUID, timingSafeEqual } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createDatabase } from "./db/connection.js";
import { registerAllTools } from "./registerTools.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const ORIUM_MCP_TOKEN = process.env.ORIUM_MCP_TOKEN;
if (!ORIUM_MCP_TOKEN) {
  throw new Error("ORIUM_MCP_TOKEN environment variable is required");
}

const PORT = Number(process.env.PORT ?? 3000);

const sql = createDatabase(DATABASE_URL);

/** Active Streamable HTTP sessions, keyed by their MCP session id. */
const transports: Record<string, StreamableHTTPServerTransport> = {};

/**
 * Constant-time comparison of two strings, safe for comparing bearer
 * tokens without leaking timing information about how much of the token
 * matched.
 */
function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const expected = `Bearer ${ORIUM_MCP_TOKEN}`;

  if (!header || !safeCompare(header, expected)) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    });
    return;
  }

  next();
}

const app = express();
app.use("/mcp", requireAuth);

app.post("/mcp", express.json(), async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        transports[newSessionId] = transport;
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };

    const server = new McpServer({ name: "orium-mcp", version: "0.1.0" });
    registerAllTools(server, sql);
    await server.connect(transport);
  } else {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: No valid session ID provided" },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

async function handleSessionRequest(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? transports[sessionId] : undefined;

  if (!transport) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  await transport.handleRequest(req, res);
}

app.get("/mcp", handleSessionRequest);
app.delete("/mcp", handleSessionRequest);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

const httpServer = app.listen(PORT, () => {
  console.error(`Orium MCP server listening on port ${PORT}`);
});

async function shutdown(): Promise<void> {
  httpServer.close();
  await Promise.all(Object.values(transports).map((transport) => transport.close()));
  await sql.end();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
