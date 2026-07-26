/**
 * `list_entries` MCP tool: queries journal entries with optional filters.
 */
import type Database from "better-sqlite3";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DATE_REGEX, type Entry, type EntryWithTags } from "../db/types.js";

const listEntriesInputSchema = {
  from: z.string().regex(DATE_REGEX, "from must be in YYYY-MM-DD format").optional(),
  to: z.string().regex(DATE_REGEX, "to must be in YYYY-MM-DD format").optional(),
  tag: z.string().min(1).optional(),
  min_mood_rating: z.number().int().min(1).max(10).optional(),
  max_mood_rating: z.number().int().min(1).max(10).optional(),
  min_energy_level: z.number().int().min(1).max(10).optional(),
  max_energy_level: z.number().int().min(1).max(10).optional(),
  limit: z.number().int().min(1).max(100).optional(),
};

/**
 * Registers the `list_entries` tool, which returns journal entries (most
 * recent first) filtered by date range, mood/energy range, and/or tag,
 * each annotated with its linked tag names.
 */
export function registerListEntriesTool(server: McpServer, db: Database.Database): void {
  server.registerTool(
    "list_entries",
    {
      title: "List journal entries",
      description:
        "List mental health journal entries, optionally filtered by date range, " +
        "mood/energy range, or tag.",
      inputSchema: listEntriesInputSchema,
    },
    ({
      from,
      to,
      tag,
      min_mood_rating,
      max_mood_rating,
      min_energy_level,
      max_energy_level,
      limit,
    }) => {
      const conditions: string[] = [];
      const params: Array<string | number> = [];

      if (from !== undefined) {
        conditions.push("e.date >= ?");
        params.push(from);
      }
      if (to !== undefined) {
        conditions.push("e.date <= ?");
        params.push(to);
      }
      if (min_mood_rating !== undefined) {
        conditions.push("e.mood_rating >= ?");
        params.push(min_mood_rating);
      }
      if (max_mood_rating !== undefined) {
        conditions.push("e.mood_rating <= ?");
        params.push(max_mood_rating);
      }
      if (min_energy_level !== undefined) {
        conditions.push("e.energy_level >= ?");
        params.push(min_energy_level);
      }
      if (max_energy_level !== undefined) {
        conditions.push("e.energy_level <= ?");
        params.push(max_energy_level);
      }
      if (tag !== undefined) {
        conditions.push(
          `e.id IN (
             SELECT et.entry_id FROM entry_tags et
             JOIN tags t ON t.id = et.tag_id
             WHERE t.name = ?
           )`,
        );
        params.push(tag.trim().toLowerCase());
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(limit ?? 20);

      const entries = db
        .prepare(
          `SELECT e.* FROM entries e
           ${whereClause}
           ORDER BY e.date DESC, e.id DESC
           LIMIT ?`,
        )
        .all(...params) as Entry[];

      const tagsForEntry = db.prepare(
        `SELECT t.name FROM tags t
         JOIN entry_tags et ON et.tag_id = t.id
         WHERE et.entry_id = ?
         ORDER BY t.name`,
      );

      const entriesWithTags: EntryWithTags[] = entries.map((entry) => ({
        ...entry,
        tags: tagsForEntry.all(entry.id).map((row) => (row as { name: string }).name),
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(entriesWithTags, null, 2) }],
      };
    },
  );
}
