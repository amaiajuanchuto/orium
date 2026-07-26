# Orium 🥝

Orium is an MCP (Model Context Protocol) server for mental health journaling. It lets
you track mood, energy, sleep, and thoughts through Claude, backed by a local SQLite
database.

## Requirements

- Node.js 18+
- A working C/C++ toolchain (needed to build the `better-sqlite3` native module — on
  macOS this means functioning Xcode Command Line Tools)

## Setup

```bash
npm install
npm run dev
```

By default the server stores data in `orium.db` in the working directory. Override the
location with the `ORIUM_DB_PATH` environment variable.

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

## Database schema

Three tables, defined in [`src/db/schema.ts`](src/db/schema.ts):

- **entries** — one row per journal entry (`date`, `mood_rating` and `energy_level`
  1–10, `sleep_hours`, `notes`, timestamps)
- **tags** — reusable tag names
- **entry_tags** — many-to-many join between entries and tags, with cascading deletes

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

## Project structure

```
src/
  db/
    schema.ts        # table definitions (source of truth)
    connection.ts     # opens the SQLite DB and applies the schema
    connection.test.ts
    types.ts          # shared Entry / EntryWithTags types
    validation.ts      # shared zod schemas (e.g. dateSchema)
    tags.ts            # tag upsert helper
    dates.ts            # shared date helpers (toISODate, addDays, round)
    streak.ts           # shared streak calculation
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

## Author 👩‍💻

Made with ❤️ by Amaia Juanchuto — Full-stack Software Engineer
[LinkedIn](https://www.linkedin.com/in/ajuanchuto/) | [GitHub](https://github.com/amaiajuanchuto)
