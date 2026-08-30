/**
 * Orium MCP server entry point. Opens the Postgres database and serves every
 * journaling tool over the MCP Streamable HTTP transport, protected by
 * Supabase OAuth.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthMetadataRouter,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import type { OAuthMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { createApiRouter } from "./api/router.js";
import { createTokenVerifier } from "./auth.js";
import { createDatabase } from "./db/connection.js";
import { registerAllTools } from "./registerTools.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** The authenticated Supabase user id, set by requireAuth. */
      userId?: string;
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
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
// dashboard/ is a sibling of server/ (two levels up from server/dist), not
// nested inside it — see the workspaces layout in the repo root README.
const DASHBOARD_DIR = path.join(__dirname, "..", "..", "dashboard", "dist");

const sql = createDatabase(DATABASE_URL);

interface McpSession {
  transport: StreamableHTTPServerTransport;
  /** The user this session was created for — every subsequent request on
   * this session id must come from the same authenticated user, or it's
   * rejected. Session ids are unguessable UUIDs, but an unguessable
   * identifier is still a secret that can leak (logs, proxies, browser
   * history); checking real identity here means a leaked session id alone
   * isn't enough to read or write someone else's journal. */
  userId: string;
}

/** Active Streamable HTTP sessions, keyed by their MCP session id. */
const sessions: Record<string, McpSession> = {};

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

// Verifies access tokens issued by Supabase's OAuth 2.1 Server against its
// published JWKS — shared by both the MCP transport and the REST API.
const verifySupabaseToken = createTokenVerifier(SUPABASE_URL);

async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;

  if (header?.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length);
    const userId = await verifySupabaseToken(token);

    if (userId) {
      req.userId = userId;
      next();
      return;
    }
  }

  res.set("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadataUrl}"`);
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Unauthorized" },
    id: null,
  });
}

const app = express();

// Render terminates TLS and proxies every request through a single hop,
// setting X-Forwarded-For to the real client IP — trust exactly that hop so
// express-rate-limit (and req.ip generally) sees the client, not Render's LB.
app.set("trust proxy", 1);

// Generous limits: this protects against runaway/malicious clients, not
// normal use — the dashboard polls several endpoints per page load.
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 600 });
const authPageLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60 });

app.use(
  mcpAuthMetadataRouter({
    oauthMetadata,
    resourceServerUrl: RESOURCE_SERVER_URL,
    resourceName: "Orium",
  }),
);
app.use("/mcp", apiLimiter, requireAuth);
app.use("/api/v1", apiLimiter, createApiRouter(sql, verifySupabaseToken));

app.post("/mcp", express.json(), async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && sessions[sessionId]) {
    // A session id alone isn't proof of identity — it must belong to the
    // same authenticated user who created it. Same 400 as "no such
    // session" so probing doesn't reveal whether a guessed id is valid.
    if (sessions[sessionId].userId !== req.userId) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    transport = sessions[sessionId].transport;
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // requireAuth always runs first and rejects unauthenticated requests, so
    // userId is guaranteed to be set here.
    const userId = req.userId!;

    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        sessions[newSessionId] = { transport, userId };
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        delete sessions[transport.sessionId];
      }
    };

    const server = new McpServer({ name: "orium-mcp", version: "0.1.0" });
    registerAllTools(server, sql, userId);
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
  const session = sessionId ? sessions[sessionId] : undefined;

  if (!session || session.userId !== req.userId) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  await session.transport.handleRequest(req, res);
}

app.get("/mcp", handleSessionRequest);
app.delete("/mcp", handleSessionRequest);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Login and OAuth consent pages for the Supabase OAuth Server flow — these
// are the human-facing pages Supabase redirects to, since it doesn't host
// its own consent UI. Unauthenticated by design: they *are* the auth step.
app.get("/login", authPageLimiter, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "login.html"));
});

app.get("/oauth/consent", authPageLimiter, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "oauth-consent.html"));
});

// The dashboard SPA, built separately (see dashboard/) and served as
// static files from this same process — see the "same service" decision
// in README for why it isn't a separate deployment. Client-side routes
// (e.g. /today, /journal) all fall back to index.html so React Router can
// take over; this must come last so it doesn't shadow /mcp, /api/v1, etc.
app.use(express.static(DASHBOARD_DIR));
app.get(/^(?!\/mcp|\/api\/v1|\/health|\/login|\/oauth\/consent).*/, (_req, res) => {
  res.sendFile(path.join(DASHBOARD_DIR, "index.html"));
});

const httpServer = app.listen(PORT, () => {
  console.error(`Orium MCP server listening on port ${PORT}`);
});

async function shutdown(): Promise<void> {
  httpServer.close();
  await Promise.all(Object.values(sessions).map((s) => s.transport.close()));
  await sql.end();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
