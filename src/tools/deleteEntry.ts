/**
 * `delete_entry` MCP tool: removes a journal entry (and its tag links) by id.
 */
import type Database from "better-sqlite3";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Entry } from "../db/types.js";

const deleteEntryInputSchema = {
  id: z.number().int().positive(),
};

/**
 * Registers the `delete_entry` tool, which removes a journal entry by id.
 * Its tag links in entry_tags are removed automatically via ON DELETE
 * CASCADE. Returns an error if no entry exists with the given id.
 */
export function registerDeleteEntryTool(server: McpServer, db: Database.Database): void {
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
    ({ id }) => {
      const entry = db.prepare("SELECT * FROM entries WHERE id = ?").get(id) as
        Entry | undefined;

      if (!entry) {
        return {
          content: [{ type: "text", text: `No entry found with id ${id}.` }],
          isError: true,
        };
      }

      db.prepare("DELETE FROM entries WHERE id = ?").run(id);

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
