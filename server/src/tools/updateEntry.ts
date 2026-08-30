/**
 * `update_entry` MCP tool: partially updates an existing journal entry.
 */
import type postgres from "postgres";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EntryDateConflictError, updateEntry } from "../core/entries.js";
import { dateSchema, notesSchema, tagsArraySchema } from "../db/validation.js";

const updateEntryInputSchema = {
  id: z.number().int().positive(),
  date: dateSchema.optional(),
  mood_rating: z.number().int().min(1).max(10).optional(),
  energy_level: z.number().int().min(1).max(10).optional(),
  sleep_hours: z.number().min(0).max(24).optional(),
  notes: notesSchema.optional(),
  tags: tagsArraySchema.optional(),
};

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
    async ({ id, ...input }) => {
      let entry;
      try {
        entry = await updateEntry(sql, userId, id, input);
      } catch (err) {
        if (err instanceof EntryDateConflictError) {
          return {
            content: [{ type: "text", text: err.message }],
            isError: true,
          };
        }
        throw err;
      }

      if (!entry) {
        return {
          content: [{ type: "text", text: `No entry found with id ${id}.` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(entry, null, 2) }],
      };
    },
  );
}
