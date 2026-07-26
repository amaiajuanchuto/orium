# Orium 🥝

**Orium is an MCP server for mental health journaling.** Track your mood, energy, sleep, and thoughts by just talking to Claude; no app to open, no form to fill out. Entries are stored locally in a SQLite database on your own machine, so your journal never leaves your computer.

```
You:    Log today — mood 7, energy 6, slept 7.5 hours, feeling good after the gym
Claude: Logged! 🎉 That's a solid entry — 7/10 mood is above your 30-day average of 6.1.

You:    How's my mood trending this month?
Claude: Your mood is up 12% vs. last month, and you're on a 9-day logging streak 🔥
```

## Why Orium

- **Private by default** — your entries live in a local SQLite file, not a third-party server.
- **No new app to learn** — journal from any Claude surface (Desktop, Code, CLI) using plain language.
- **Actually useful over time** — trends, correlations, and streaks turn a pile of entries into insight instead of just a diary.

## Requirements

- Node.js 18+
- A working C/C++ toolchain (needed to build the `better-sqlite3` native module — on
  macOS this means functioning Xcode Command Line Tools)

## Installation

Orium isn't published to npm yet, so install it from source:

```bash
git clone https://github.com/amaiajuanchuto/orium-mcp.git
cd orium-mcp
npm install
npm run build
```

This produces a runnable server at `dist/index.js`. Note the full path to this repo — you'll need it to point your MCP client at the server below.

### Add to Claude Desktop

Open your Claude Desktop config and add:

```json
{
  "mcpServers": {
    "orium": {
      "command": "node",
      "args": ["/absolute/path/to/orium-mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You should see Orium's tools available in the 🔨 tools menu.

### Add to Claude Code

```bash
claude mcp add orium -- node /absolute/path/to/orium-mcp/dist/index.js
```

Verify it's connected with `claude mcp list`, or check its status inside a session with `/mcp`.

### Where your data goes

By default, entries are stored in `orium.db` in the directory the server runs from. To keep all your journal data in one predictable place regardless of working directory, point it somewhere explicit with `ORIUM_DB_PATH`:

```json
{
  "mcpServers": {
    "orium": {
      "command": "node",
      "args": ["/absolute/path/to/orium-mcp/dist/index.js"],
      "env": {
        "ORIUM_DB_PATH": "/Users/you/orium/orium.db"
      }
    }
  }
}
```

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

Three tables, defined in [`src/db/schema.ts`](src/db/schema.ts):

- **entries** — one row per journal entry (`date`, `mood_rating` and `energy_level` 1–10, `sleep_hours`, `notes`, timestamps)
- **tags** — reusable tag names
- **entry_tags** — many-to-many join between entries and tags, with cascading deletes

## Scripts

| Command                | Description                              |
| ---------------------- | -----------------------------------------|
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

## Contributing

Issues and PRs are welcome. Before opening a PR, please run:

```bash
npm run lint && npm run format:check && npm test
```

## A note on privacy

Orium is not a substitute for professional mental health support. If you're in crisis, please reach out to a mental health professional or a crisis line in your country.

## Author 👩‍💻

Made with ❤️ by Amaia Juanchuto — Full-stack Software Engineer [LinkedIn](https://www.linkedin.com/in/ajuanchuto/) | [GitHub](https://github.com/amaiajuanchuto)
