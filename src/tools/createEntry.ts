import type Database from "better-sqlite3";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { upsertTag } from "../db/tags.js";
import type { Entry } from "../db/types.js";

const createEntryInputSchema = {
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in YYYY-MM-DD format"),
  mood_rating: z.number().int().min(1).max(10),
  energy_level: z.number().int().min(1).max(10),
  sleep_hours: z.number().min(0).max(24).optional(),
  notes: z.string().optional(),
  tags: z.array(z.string().min(1)).optional(),
};

/**
 * Registers the `create_entry` tool, which inserts a new journal entry
 * (optionally linking it to one or more tags, created on demand) and
 * returns the persisted row.
 */
export function registerCreateEntryTool(server: McpServer, db: Database.Database): void {
  server.registerTool(
    "create_entry",
    {
      title: "Create journal entry",
      description:
        "Create a new mental health journal entry with mood, energy, sleep, and notes.",
      inputSchema: createEntryInputSchema,
    },
    ({ date, mood_rating, energy_level, sleep_hours, notes, tags }) => {
      const insertEntry = db.transaction(() => {
        const result = db
          .prepare(
            `INSERT INTO entries (date, mood_rating, energy_level, sleep_hours, notes)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(date, mood_rating, energy_level, sleep_hours ?? null, notes ?? null);

        const entryId = result.lastInsertRowid as number;

        for (const tagName of tags ?? []) {
          const tagId = upsertTag(db, tagName);
          db.prepare(
            "INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)",
          ).run(entryId, tagId);
        }

        return db.prepare("SELECT * FROM entries WHERE id = ?").get(entryId) as Entry;
      });

      const entry = insertEntry();

      return {
        content: [{ type: "text", text: JSON.stringify(entry, null, 2) }],
      };
    },
  );
}
