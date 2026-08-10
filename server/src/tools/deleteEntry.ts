/**
 * `delete_entry` MCP tool: removes a journal entry (and its tag links) by id.
 */
import type postgres from "postgres";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { deleteEntry } from "../core/entries.js";

const deleteEntryInputSchema = {
  id: z.number().int().positive(),
};

/**
 * Registers the `delete_entry` tool, which removes a journal entry by id.
 * Its tag links in entry_tags are removed automatically via ON DELETE
 * CASCADE. Returns an error if no entry exists with the given id.
 */
export function registerDeleteEntryTool(
  server: McpServer,
  sql: postgres.Sql,
  userId: string,
): void {
  server.registerTool(
    "delete_entry",
    {
      title: "Delete journal entry",
      description: "Delete a journal entry by id.",
      inputSchema: deleteEntryInputSchema,
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
      },
    },
    async ({ id }) => {
      const entry = await deleteEntry(sql, userId, id);

      if (!entry) {
        return {
          content: [{ type: "text", text: `No entry found with id ${id}.` }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Deleted entry ${id} (date ${entry.date}).`,
          },
        ],
      };
    },
  );
}
