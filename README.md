# Orium 🥝

**Orium is an MCP server for mental health journaling.** Track your mood, energy, sleep, and thoughts by just talking to Claude; no app to open, no form to fill out. Entries are stored in a Postgres database (Supabase), so your journal persists across machines and sessions.

```
You:    Log today — mood 7, energy 6, slept 7.5 hours, feeling good after the gym
Claude: Logged! 🎉 That's a solid entry — 7/10 mood is above your 30-day average of 6.1.

You:    How's my mood trending this month?
Claude: Your mood is up 12% vs. last month, and you're on a 9-day logging streak 🔥
```

## Why Orium

- **No new app to learn** — journal from any Claude surface (Desktop, Code, CLI) using plain language.
- **Actually useful over time** — trends, correlations, and streaks turn a pile of entries into insight instead of just a diary.

## Requirements

- Node.js 18+
- A Postgres database — a free [Supabase](https://supabase.com) project is the easiest way to get one

## Installation

Orium isn't published to npm yet, so install it from source:

```bash
git clone https://github.com/amaiajuanchuto/orium-mcp.git
cd orium-mcp
npm install
npm run build
```

This produces a runnable server at `dist/index.js`.

### Set up the database

1. Create a Supabase project (or use any Postgres instance).
2. Apply the schema in [`supabase/migrations`](supabase/migrations) — via the Supabase CLI (`supabase db push`) or by running the SQL directly against your database.
3. Grab a connection string from your project's Database settings (the pooled connection, port 6543, is recommended for normal use).

### Run the server

Orium is an MCP server over **Streamable HTTP**, not stdio — it runs as a long-lived process that your MCP client connects to over the network (locally or remotely), rather than being launched per-client.

```bash
DATABASE_URL="postgresql://postgres:[password]@[host]:6543/postgres" \
ORIUM_MCP_TOKEN="pick-a-long-random-secret" \
PORT=3000 \
  npm start
```

- `DATABASE_URL` — required, your Postgres connection string.
- `ORIUM_MCP_TOKEN` — required, a shared secret clients must send as `Authorization: Bearer <token>`. Generate one with `openssl rand -hex 32`.
- `PORT` — optional, defaults to `3000`.
- `GET /health` returns `200 OK` and needs no auth, for use with your host's health checks.

For a server reachable outside your own machine, deploy this process somewhere that runs long-lived Node processes (e.g. Fly.io, Render, Railway), keeping `DATABASE_URL` and `ORIUM_MCP_TOKEN` as secrets there.

### Add to Claude Desktop or Claude Code

Both accept a remote MCP server by URL. Point either at `http://<host>:<port>/mcp` (or your deployed HTTPS URL) with the bearer token in the `Authorization` header — consult your client's docs for the current syntax for adding a remote/HTTP MCP server, as this is evolving faster than most other parts of the MCP spec.

### Where your data goes

Entries live in the Postgres database at `DATABASE_URL`. The same database — and the same running server — is reachable from any client that has the URL and the bearer token, from any machine.

## Usage examples

Once connected, just talk to Claude naturally; it picks the right tool for you.

**Logging an entry**

> "Journal entry for today: mood 8, energy 7, slept 8 hours, tag it 'good day' and 'exercise'. Notes: went for a run, felt great afterward."

**Checking in**

> "Did I already log today?"
> "What was my mood like last Tuesday?"

**Searching entries**

> "Find every entry where I mentioned 'anxious'."

**Trends and patterns**

> "How does my mood this month compare to last month?"
> "Is there a connection between how much I sleep and my mood?"
> "Which day of the week am I usually happiest?"

**Streaks and summaries**

> "What's my current logging streak?"
> "Give me a summary of my month."

**Editing and cleanup**

> "Update today's entry — I forgot to log that I only slept 5 hours."
> "Delete the entry from March 3rd."

## Tools

| Tool              | Description                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `create_entry`    | Create a new journal entry (mood, energy, sleep, notes, tags)                                                               |
| `list_entries`    | List entries, filterable by date range, mood/energy range, or tag                                                           |
| `update_entry`    | Partially update an entry by id; replaces tags if provided                                                                  |
| `delete_entry`    | Delete an entry by id (destructive)                                                                                         |
| `get_today`       | Look up today's entry, if one exists                                                                                        |
| `search_entries`  | Case-insensitive keyword search across entry notes                                                                          |
| `get_mood_trends` | Compare average mood/energy/sleep over a week/month/quarter vs. the prior period                                            |
| `get_patterns`    | Find the strongest correlations between mood and sleep, day of week, or tags                                                |
| `get_streak`      | Report the current/longest daily-logging streak and progress to the next milestone                                          |
| `get_summary`     | Comprehensive week/month review: averages, trend, best/worst days, top tags, tag impact, streak, and a personalized message |

## Database schema

Three tables, defined in [`supabase/migrations`](supabase/migrations):

- **entries** — one row per journal entry (`date`, `mood_rating` and `energy_level` 1–10, `sleep_hours`, `notes`, timestamps; `updated_at` is refreshed automatically by a trigger)
- **tags** — reusable tag names
- **entry_tags** — many-to-many join between entries and tags, with cascading deletes

## Scripts

| Command                | Description                              |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | Run the server directly with `tsx`       |
| `npm run build`        | Compile TypeScript to `dist/`            |
| `npm start`            | Run the compiled server from `dist/`     |
| `npm test`             | Run the Vitest test suite once           |
| `npm run test:watch`   | Run tests in watch mode                  |
| `npm run lint`         | Lint the project with ESLint             |
| `npm run lint:fix`     | Lint and auto-fix                        |
| `npm run format`       | Format the project with Prettier         |
| `npm run format:check` | Check formatting without writing changes |

## Project structure

```
supabase/
  migrations/          # schema (source of truth), applied via the Supabase CLI/MCP
src/
  db/
    connection.ts       # opens the Postgres connection
    connection.test.ts
    types.ts             # shared Entry / EntryWithTags types
    validation.ts         # shared zod schemas (e.g. dateSchema)
    tags.ts                # tag upsert helper
    dates.ts                 # shared date helpers (toISODate, addDays, round)
    streak.ts                 # shared streak calculation
  tools/
    createEntry.ts
    listEntries.ts
    updateEntry.ts
    deleteEntry.ts
    getToday.ts
    searchEntries.ts
    getMoodTrends.ts
    getPatterns.ts
    getStreak.ts
    getSummary.ts
    *.test.ts          # one test file per tool
  index.ts             # MCP server entry point; registers all tools
```

## Contributing

Tests run against a local Postgres instance via the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) — install it, make sure Docker is running, then:

```bash
supabase start   # boots a local Postgres + applies supabase/migrations
npm test
```

Before opening a PR, please run:

```bash
npm run lint && npm run format:check && npm test
```

## A note on privacy

Orium is not a substitute for professional mental health support. If you're in crisis, please reach out to a mental health professional or a crisis line in your country.

## Author 👩‍💻

Made with ❤️ by Amaia Juanchuto — Full-stack Software Engineer [LinkedIn](https://www.linkedin.com/in/ajuanchuto/) | [GitHub](https://github.com/amaiajuanchuto)
