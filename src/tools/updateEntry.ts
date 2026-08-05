/**
 * `update_entry` MCP tool: partially updates an existing journal entry.
 */
import type postgres from "postgres";
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
 * @param sql - Open database connection.
 * @param id - Id of the entry to fetch. Assumed to exist and belong to `userId`.
 * @param userId - The authenticated user's id.
 * @returns The entry row with a `tags` array of tag names.
 */
async function getEntryWithTags(
  sql: postgres.Sql | postgres.TransactionSql,
  id: number,
  userId: string,
): Promise<EntryWithTags> {
  const [entry] = await sql<
    Entry[]
  >`SELECT * FROM entries WHERE id = ${id} AND user_id = ${userId}`;
  const tags = (
    await sql<{ name: string }[]>`
      SELECT t.name FROM tags t
      JOIN entry_tags et ON et.tag_id = t.id
      WHERE et.entry_id = ${id}
      ORDER BY t.name
    `
  ).map((row) => row.name);

  return { ...entry!, tags };
}

/**
 * Registers the `update_entry` tool, which partially updates an existing
 * journal entry by id: only the provided fields are changed, `updated_at`
 * is refreshed by a database trigger, and a provided `tags` array fully
 * replaces the entry's existing tags. Returns the full updated entry with
 * its tags, or an error if no entry exists with the given id.
 */
export function registerUpdateEntryTool(
  server: McpServer,
  sql: postgres.Sql,
  userId: string,
): void {
  server.registerTool(
    "update_entry",
    {
      title: "Update journal entry",
      description:
        "Update an existing journal entry by id. Only the provided fields are " +
        "changed; if tags is provided, it replaces all existing tags for the entry.",
      inputSchema: updateEntryInputSchema,
    },
    async ({ id, date, mood_rating, energy_level, sleep_hours, notes, tags }) => {
      const [exists] =
        await sql`SELECT 1 FROM entries WHERE id = ${id} AND user_id = ${userId}`;
      if (!exists) {
        return {
          content: [{ type: "text", text: `No entry found with id ${id}.` }],
          isError: true,
        };
      }

      const entry = await sql.begin(async (tx) => {
        const updates: Record<string, unknown> = {};
        if (date !== undefined) updates.date = date;
        if (mood_rating !== undefined) updates.mood_rating = mood_rating;
        if (energy_level !== undefined) updates.energy_level = energy_level;
        if (sleep_hours !== undefined) updates.sleep_hours = sleep_hours;
        if (notes !== undefined) updates.notes = notes;

        if (Object.keys(updates).length > 0) {
          await tx`UPDATE entries SET ${tx(updates)} WHERE id = ${id} AND user_id = ${userId}`;
        } else {
          // No scalar fields changed (e.g. a tags-only update) — still touch
          // the row so the updated_at trigger fires, matching the tool's
          // documented behavior of always refreshing updated_at.
          await tx`UPDATE entries SET updated_at = DEFAULT WHERE id = ${id} AND user_id = ${userId}`;
        }

        if (tags !== undefined) {
          await tx`DELETE FROM entry_tags WHERE entry_id = ${id}`;

          for (const tagName of tags) {
            const tagId = await upsertTag(tx, tagName);
            await tx`
              INSERT INTO entry_tags (entry_id, tag_id)
              VALUES (${id}, ${tagId})
              ON CONFLICT DO NOTHING
            `;
          }
        }

        return getEntryWithTags(tx, id, userId);
      });

      return {
        content: [{ type: "text", text: JSON.stringify(entry, null, 2) }],
      };
    },
  );
}
