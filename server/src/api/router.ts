/**
 * REST API router (`/api/v1`) for the Orium journal — a RESTful surface
 * over the same core logic the MCP tools use, intended for a future web
 * dashboard. Authenticated the same way as `/mcp`: a Supabase OAuth
 * access token as `Authorization: Bearer <token>`.
 */
import type postgres from "postgres";
import express, {
  type NextFunction,
  type Request,
  type Response,
  type Router,
} from "express";
import { z } from "zod";
import {
  createEntry,
  deleteEntry,
  getEntryById,
  getTodayEntry,
  listEntries,
  searchEntries,
  updateEntry,
} from "../core/entries.js";
import { getMoodTrends, getPatterns, getStreak, getSummary } from "../core/insights.js";
import { getProfile, upsertProfile } from "../core/profile.js";
import { DATE_REGEX } from "../db/types.js";
import { dateSchema } from "../db/validation.js";
import type { TokenVerifier } from "../auth.js";

const moodOrEnergySchema = z.number().int().min(1).max(10);

const createEntryBodySchema = z.object({
  date: dateSchema,
  mood_rating: moodOrEnergySchema,
  energy_level: moodOrEnergySchema,
  sleep_hours: z.number().min(0).max(24).optional(),
  notes: z.string().optional(),
  tags: z.array(z.string().min(1)).optional(),
});

const updateEntryBodySchema = z.object({
  date: dateSchema.optional(),
  mood_rating: moodOrEnergySchema.optional(),
  energy_level: moodOrEnergySchema.optional(),
  sleep_hours: z.number().min(0).max(24).optional(),
  notes: z.string().optional(),
  tags: z.array(z.string().min(1)).optional(),
});

const listEntriesQuerySchema = z.object({
  from: z.string().regex(DATE_REGEX, "from must be in YYYY-MM-DD format").optional(),
  to: z.string().regex(DATE_REGEX, "to must be in YYYY-MM-DD format").optional(),
  tag: z.string().min(1).optional(),
  min_mood_rating: z.coerce.number().int().min(1).max(10).optional(),
  max_mood_rating: z.coerce.number().int().min(1).max(10).optional(),
  min_energy_level: z.coerce.number().int().min(1).max(10).optional(),
  max_energy_level: z.coerce.number().int().min(1).max(10).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const searchQuerySchema = z.object({
  keyword: z.string().min(1).max(200),
});

const summaryQuerySchema = z.object({
  period: z.enum(["week", "month"]),
});

const moodTrendsQuerySchema = z.object({
  period: z.enum(["week", "month", "quarter"]),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const upsertProfileBodySchema = z.object({
  name: z.string().nullable().optional(),
  age: z.string().nullable().optional(),
  pronouns: z.string().nullable().optional(),
  work: z.string().nullable().optional(),
  work_rhythm: z.string().nullable().optional(),
  exercise: z.array(z.string().min(1)).optional(),
  diet: z.string().nullable().optional(),
  hobbies: z.array(z.string().min(1)).optional(),
  note: z.string().nullable().optional(),
});

/**
 * Parses `input` against `schema`, responding with 400 and the validation
 * issues if it doesn't match.
 *
 * @returns The parsed value, or undefined if validation failed (a 400
 *   response has already been sent — the caller should return immediately).
 */
function parseOr400<T>(
  schema: z.ZodType<T>,
  input: unknown,
  res: Response,
): T | undefined {
  const result = schema.safeParse(input);
  if (!result.success) {
    res.status(400).json({ error: "Validation failed", issues: result.error.issues });
    return undefined;
  }
  return result.data;
}

function requireApiAuth(verifySupabaseToken: TokenVerifier) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

    res.status(401).json({ error: "Unauthorized" });
  };
}

/**
 * Builds the `/api/v1` router.
 *
 * @param sql - Open database connection shared across requests.
 * @param verifySupabaseToken - Verifies a bearer token and returns the
 *   authenticated user's id, or null if invalid.
 */
export function createApiRouter(
  sql: postgres.Sql,
  verifySupabaseToken: TokenVerifier,
): Router {
  const router = express.Router();

  router.use(express.json());
  router.use(requireApiAuth(verifySupabaseToken));

  router.get("/entries", async (req, res) => {
    const query = parseOr400(listEntriesQuerySchema, req.query, res);
    if (!query) return;

    res.json(await listEntries(sql, req.userId!, query));
  });

  router.post("/entries", async (req, res) => {
    const body = parseOr400(createEntryBodySchema, req.body, res);
    if (!body) return;

    const entry = await createEntry(sql, req.userId!, body);
    res.status(201).json(entry);
  });

  router.get("/entries/:id", async (req, res) => {
    const params = parseOr400(idParamSchema, req.params, res);
    if (!params) return;

    const entry = await getEntryById(sql, req.userId!, params.id);
    if (!entry) {
      res.status(404).json({ error: `No entry found with id ${params.id}.` });
      return;
    }

    res.json(entry);
  });

  router.patch("/entries/:id", async (req, res) => {
    const params = parseOr400(idParamSchema, req.params, res);
    if (!params) return;
    const body = parseOr400(updateEntryBodySchema, req.body, res);
    if (!body) return;

    const entry = await updateEntry(sql, req.userId!, params.id, body);
    if (!entry) {
      res.status(404).json({ error: `No entry found with id ${params.id}.` });
      return;
    }

    res.json(entry);
  });

  router.delete("/entries/:id", async (req, res) => {
    const params = parseOr400(idParamSchema, req.params, res);
    if (!params) return;

    const entry = await deleteEntry(sql, req.userId!, params.id);
    if (!entry) {
      res.status(404).json({ error: `No entry found with id ${params.id}.` });
      return;
    }

    res.status(200).json(entry);
  });

  router.get("/today", async (req, res) => {
    res.json(await getTodayEntry(sql, req.userId!));
  });

  router.get("/search", async (req, res) => {
    const query = parseOr400(searchQuerySchema, req.query, res);
    if (!query) return;

    res.json(await searchEntries(sql, req.userId!, query.keyword));
  });

  router.get("/streak", async (req, res) => {
    res.json(await getStreak(sql, req.userId!));
  });

  router.get("/summary", async (req, res) => {
    const query = parseOr400(summaryQuerySchema, req.query, res);
    if (!query) return;

    res.json(await getSummary(sql, req.userId!, query.period));
  });

  router.get("/mood-trends", async (req, res) => {
    const query = parseOr400(moodTrendsQuerySchema, req.query, res);
    if (!query) return;

    res.json(await getMoodTrends(sql, req.userId!, query.period));
  });

  router.get("/patterns", async (req, res) => {
    res.json(await getPatterns(sql, req.userId!));
  });

  router.get("/profile", async (req, res) => {
    res.json(await getProfile(sql, req.userId!));
  });

  router.put("/profile", async (req, res) => {
    const body = parseOr400(upsertProfileBodySchema, req.body, res);
    if (!body) return;

    res.json(await upsertProfile(sql, req.userId!, body));
  });

  // Express 5 forwards rejected promises from the async handlers above to
  // this error handler automatically.
  router.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    console.error("API error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return router;
}
