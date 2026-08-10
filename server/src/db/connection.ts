/**
 * Opens a connection to the Postgres database. The schema (tables, indexes,
 * and the `updated_at` trigger) is managed via Supabase migrations — see
 * supabase/migrations — not applied here.
 */
import postgres from "postgres";

/**
 * Opens a Postgres connection at `connectionString`. Assumes the schema has
 * already been applied via Supabase migrations.
 *
 * Configures the `date` column type to pass through as a raw `YYYY-MM-DD`
 * string rather than being parsed into a JS `Date`, matching the format the
 * rest of the app (and its zod validation) expects.
 *
 * @param connectionString - A Postgres connection string (e.g. `DATABASE_URL`).
 * @returns An open connection ready to run queries against.
 */
export function createDatabase(connectionString: string): postgres.Sql {
  return postgres(connectionString, {
    // Supabase's Transaction pooler (the connection this app uses — see
    // README) doesn't guarantee the same backend connection across
    // statements, which breaks postgres.js's default server-side prepared
    // statements ("prepared statement ... does not exist" errors under
    // load). Disabling them is the standard fix for pgbouncer transaction
    // mode: https://github.com/porsager/postgres#pgbouncer
    prepare: false,
    types: {
      date: {
        to: 1082,
        from: [1082],
        serialize: (value: string): string => value,
        parse: (value: string): string => value,
      },
    },
  });
}
