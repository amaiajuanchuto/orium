/**
 * Opens (or creates) the SQLite database file and ensures its schema exists.
 */
import Database from "better-sqlite3";
import { SCHEMA_SQL } from "./schema.js";

/**
 * Opens a SQLite database at `filename` in WAL mode and applies the schema
 * (idempotent — safe to call against an existing database).
 *
 * @param filename - Path to the SQLite database file.
 * @returns An open, ready-to-use database connection.
 */
export function createDatabase(filename: string): Database.Database {
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQL);
  return db;
}
