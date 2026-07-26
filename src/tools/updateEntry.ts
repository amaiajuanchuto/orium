/**
 * `update_entry` MCP tool: partially updates an existing journal entry.
 */
import type Database from "better-sqlite3";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { upsertTag } from "../db/tags.js";
import type { Entry, EntryWithTags } from "../db/types.js";
import { dateSchema } from "../db/validation.js";

const updateEntryInputSchema = {
  id: z.number().int().positive(),
  date: dateSchema.optional(),
  mood_rating: z.number().int().min(1).max(10).optional(),
  energy_level: z.number().int().min(1).max(10).optional(),
  sleep_hours: z.number().min(0).max(24).optional(),
  notes: z.string().optional(),
  tags: z.array(z.string().min(1)).optional(),
};

/**
 * Fetches an entry by id along with its linked tag names.
 *
 * @param db - Open database connection.
 * @param id - Id of the entry to fetch. Assumed to exist.
 * @returns The entry row with a `tags` array of tag names.
 */
function getEntryWithTags(db: Database.Database, id: number): EntryWithTags {
  const entry = db.prepare("SELECT * FROM entries WHERE id = ?").get(id) as Entry;
  const tags = db
    .prepare(
      `SELECT t.name FROM tags t
       JOIN entry_tags et ON et.tag_id = t.id
       WHERE et.entry_id = ?
       ORDER BY t.name`,
    )
    .all(id)
    .map((row) => (row as { name: string }).name);

  return { ...entry, tags };
}

/**
 * Registers the `update_entry` tool, which partially updates an existing
 * journal entry by id: only the provided fields are changed, `updated_at`
 * is refreshed, and a provided `tags` array fully replaces the entry's
 * existing tags. Returns the full updated entry with its tags, or an
 * error if no entry exists with the given id.
 */
export function registerUpdateEntryTool(server: McpServer, db: Database.Database): void {
  server.registerTool(
    "update_entry",
    {
      title: "Update journal entry",
      description:
        "Update an existing journal entry by id. Only the provided fields are " +
        "changed; if tags is provided, it replaces all existing tags for the entry.",
      inputSchema: updateEntryInputSchema,
    },
    ({ id, date, mood_rating, energy_level, sleep_hours, notes, tags }) => {
      const exists = db.prepare("SELECT 1 FROM entries WHERE id = ?").get(id);
      if (!exists) {
        return {
          content: [{ type: "text", text: `No entry found with id ${id}.` }],
          isError: true,
        };
      }

      const updateEntry = db.transaction(() => {
        const setClauses: string[] = ["updated_at = datetime('now')"];
        const params: Array<string | number> = [];

        if (date !== undefined) {
          setClauses.push("date = ?");
          params.push(date);
        }
        if (mood_rating !== undefined) {
          setClauses.push("mood_rating = ?");
          params.push(mood_rating);
        }
        if (energy_level !== undefined) {
          setClauses.push("energy_level = ?");
          params.push(energy_level);
        }
        if (sleep_hours !== undefined) {
          setClauses.push("sleep_hours = ?");
          params.push(sleep_hours);
        }
        if (notes !== undefined) {
          setClauses.push("notes = ?");
          params.push(notes);
        }

        params.push(id);
        db.prepare(`UPDATE entries SET ${setClauses.join(", ")} WHERE id = ?`).run(
          ...params,
        );

        if (tags !== undefined) {
          db.prepare("DELETE FROM entry_tags WHERE entry_id = ?").run(id);

          for (const tagName of tags) {
            const tagId = upsertTag(db, tagName);
            db.prepare(
              "INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)",
            ).run(id, tagId);
          }
        }

        return getEntryWithTags(db, id);
      });

      const entry = updateEntry();

      return {
        content: [{ type: "text", text: JSON.stringify(entry, null, 2) }],
      };
    },
  );
}
