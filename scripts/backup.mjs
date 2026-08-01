/**
 * Exports all journal data (entries, tags, entry_tags) to a JSON file.
 * Schema itself is already version-controlled via supabase/migrations —
 * this only needs to capture data.
 *
 * Usage: DATABASE_URL=... node scripts/backup.mjs <output-file>
 */
import { writeFile } from "node:fs/promises";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const outputPath = process.argv[2];
if (!outputPath) {
  throw new Error("Usage: node scripts/backup.mjs <output-file>");
}

const sql = postgres(DATABASE_URL, {
  types: {
    date: {
      to: 1082,
      from: [1082],
      serialize: (value) => value,
      parse: (value) => value,
    },
  },
});

const [entries, tags, entryTags] = await Promise.all([
  sql`SELECT * FROM entries ORDER BY id`,
  sql`SELECT * FROM tags ORDER BY id`,
  sql`SELECT * FROM entry_tags ORDER BY entry_id, tag_id`,
]);

const backup = {
  exported_at: new Date().toISOString(),
  entries,
  tags,
  entry_tags: entryTags,
};

await writeFile(outputPath, JSON.stringify(backup, null, 2));
console.log(
  `Backed up ${entries.length} entries, ${tags.length} tags, ${entryTags.length} entry_tags to ${outputPath}`,
);

await sql.end();
