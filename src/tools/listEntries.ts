/**
 * `list_entries` MCP tool: queries journal entries with optional filters.
 */
import type postgres from "postgres";
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
export function registerListEntriesTool(server: McpServer, sql: postgres.Sql): void {
  server.registerTool(
    "list_entries",
    {
      title: "List journal entries",
      description:
        "List mental health journal entries, optionally filtered by date range, " +
        "mood/energy range, or tag.",
      inputSchema: listEntriesInputSchema,
    },
    async ({
      from,
      to,
      tag,
      min_mood_rating,
      max_mood_rating,
      min_energy_level,
      max_energy_level,
      limit,
    }) => {
      const entries = await sql<Entry[]>`
        SELECT e.* FROM entries e
        WHERE (${from ?? null}::date IS NULL OR e.date >= ${from ?? null})
          AND (${to ?? null}::date IS NULL OR e.date <= ${to ?? null})
          AND (${min_mood_rating ?? null}::int IS NULL OR e.mood_rating >= ${min_mood_rating ?? null})
          AND (${max_mood_rating ?? null}::int IS NULL OR e.mood_rating <= ${max_mood_rating ?? null})
          AND (${min_energy_level ?? null}::int IS NULL OR e.energy_level >= ${min_energy_level ?? null})
          AND (${max_energy_level ?? null}::int IS NULL OR e.energy_level <= ${max_energy_level ?? null})
          AND (
            ${tag?.trim().toLowerCase() ?? null}::text IS NULL
            OR e.id IN (
              SELECT et.entry_id FROM entry_tags et
              JOIN tags t ON t.id = et.tag_id
              WHERE t.name = ${tag?.trim().toLowerCase() ?? null}
            )
          )
        ORDER BY e.date DESC, e.id DESC
        LIMIT ${limit ?? 20}
      `;

      const entriesWithTags: EntryWithTags[] = await Promise.all(
        entries.map(async (entry) => {
          const tags = (
            await sql<{ name: string }[]>`
              SELECT t.name FROM tags t
              JOIN entry_tags et ON et.tag_id = t.id
              WHERE et.entry_id = ${entry.id}
              ORDER BY t.name
            `
          ).map((row) => row.name);

          return { ...entry, tags };
        }),
      );

      return {
        content: [{ type: "text", text: JSON.stringify(entriesWithTags, null, 2) }],
      };
    },
  );
}
