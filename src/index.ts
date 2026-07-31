/**
 * Orium MCP server entry point. Opens the Postgres database and serves every
 * journaling tool over the MCP Streamable HTTP transport, protected by a
 * shared bearer token.
 */
import { randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthMetadataRouter,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import type { OAuthMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { createRemoteJWKSet, jwtVerify } from "jose";
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

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL environment variable is required");
}

const PUBLIC_URL = process.env.PUBLIC_URL;
if (!PUBLIC_URL) {
  throw new Error("PUBLIC_URL environment variable is required");
}

const PORT = Number(process.env.PORT ?? 3000);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const sql = createDatabase(DATABASE_URL);

/** Active Streamable HTTP sessions, keyed by their MCP session id. */
const transports: Record<string, StreamableHTTPServerTransport> = {};

// We're a resource server only — Supabase's OAuth 2.1 Server is the actual
// authorization server. Rather than hand-typing its endpoints (and risking
// drift from what this beta feature actually serves), fetch its published
// metadata once at startup and re-advertise it via the MCP SDK's standard
// protected-resource metadata router, so clients can discover it automatically.
const RESOURCE_SERVER_URL = new URL("/mcp", PUBLIC_URL);
const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(RESOURCE_SERVER_URL);

async function fetchSupabaseOAuthMetadata(): Promise<OAuthMetadata> {
  const discoveryUrl = `${SUPABASE_URL}/.well-known/oauth-authorization-server/auth/v1`;
  const response = await fetch(discoveryUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch Supabase OAuth metadata from ${discoveryUrl}: ${response.status}`,
    );
  }
  return (await response.json()) as OAuthMetadata;
}

const oauthMetadata = await fetchSupabaseOAuthMetadata();

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

// Verifies access tokens issued by Supabase's OAuth 2.1 Server against its
// published JWKS. `createRemoteJWKSet` fetches and caches the signing keys
// automatically, refetching if a token references an unrecognized key id.
const supabaseJwks = createRemoteJWKSet(
  new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);
const SUPABASE_ISSUER = `${SUPABASE_URL}/auth/v1`;

async function isValidSupabaseToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, supabaseJwks, {
      issuer: SUPABASE_ISSUER,
      audience: "authenticated",
    });
    return true;
  } catch {
    return false;
  }
}

// Accepts either the legacy shared bearer token or a valid Supabase OAuth
// access token, so existing Claude Code connections keep working while
// claude.ai (and anything else that needs real OAuth) uses Supabase login.
async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;

  if (header?.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length);

    if (safeCompare(header, `Bearer ${ORIUM_MCP_TOKEN}`) || (await isValidSupabaseToken(token))) {
      next();
      return;
    }
  }

  res.set(
    "WWW-Authenticate",
    `Bearer resource_metadata="${resourceMetadataUrl}"`,
  );
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Unauthorized" },
    id: null,
  });
}

const app = express();
app.use(
  mcpAuthMetadataRouter({
    oauthMetadata,
    resourceServerUrl: RESOURCE_SERVER_URL,
    resourceName: "Orium",
  }),
);
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

// Login and OAuth consent pages for the Supabase OAuth Server flow — these
// are the human-facing pages Supabase redirects to, since it doesn't host
// its own consent UI. Unauthenticated by design: they *are* the auth step.
app.get("/login", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "login.html"));
});

app.get("/oauth/consent", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "oauth-consent.html"));
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
