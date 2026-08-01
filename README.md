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
3. Grab a connection string from your project's Database settings — use the **Transaction pooler** connection (port `6543`), not the direct connection (port `5432`). Many hosts (Render included) don't support outbound IPv6, and Supabase's direct connection is IPv6-only in most regions; the pooler is IPv4-compatible and avoids a confusing `ENETUNREACH` at runtime.

### Set up Supabase OAuth

Every client — claude.ai, the mobile app, Claude Code, Claude Desktop — authenticates via Supabase OAuth. There's no shared-secret fallback.

To enable OAuth on your own Supabase project:

1. **Authentication → OAuth Server** → enable it (currently in beta).
2. Set **Site URL** to your deployed server's public URL (e.g. `https://your-app.onrender.com`), and **Auth Path** to `/oauth/consent`.
3. Enable **Allow Dynamic OAuth Apps** — claude.ai self-registers as an OAuth client on first connection (no manual client ID/secret needed) rather than using a pre-registered one.
4. **Authentication → Sign In / Providers** → disable public sign-up (**"Allow new users to sign up"**). This project intentionally has no per-user data isolation — every valid login sees the same journal — so only you should ever be able to create an account here.
5. Create your own login: **Authentication → Users → Add user**, using the admin panel directly (not the public sign-up form, which you just disabled).

The login (`/login`) and consent (`/oauth/consent`) pages Supabase redirects to for this flow are served by Orium itself — see [`public/`](public) — since Supabase's OAuth Server doesn't host its own consent UI.

### Run the server

Orium is an MCP server over **Streamable HTTP**, not stdio — it runs as a long-lived process that your MCP client connects to over the network (locally or remotely), rather than being launched per-client.

```bash
DATABASE_URL="postgresql://postgres:[password]@[host]:6543/postgres" \
SUPABASE_URL="https://<project-ref>.supabase.co" \
PUBLIC_URL="https://your-app.onrender.com" \
PORT=3000 \
  npm start
```

- `DATABASE_URL` — required, your Postgres connection string.
- `SUPABASE_URL` — required, your Supabase project URL — used to validate OAuth access tokens against its JWKS.
- `PUBLIC_URL` — required, the public URL this server is reachable at — used to advertise the OAuth resource-server metadata clients need for discovery.
- `PORT` — optional, defaults to `3000`.
- `GET /health` returns `200 OK` and needs no auth, for use with your host's health checks.

For a server reachable outside your own machine, deploy this process somewhere that runs long-lived Node processes (e.g. Render, Fly.io, Railway), keeping `DATABASE_URL` and `SUPABASE_URL`/`PUBLIC_URL` as env vars there.

### Deploy on Render

This repo includes a [`render.yaml`](render.yaml) blueprint:

1. Push your fork to GitHub.
2. On [Render](https://render.com), **New + → Blueprint**, connect your GitHub account, and select your fork.
3. Render reads `render.yaml` and prompts you for the secret env var (`DATABASE_URL`) — paste in your Supabase pooler connection string. Update `SUPABASE_URL` and `PUBLIC_URL` in the blueprint (or the dashboard afterward) to match your own project and deployed URL.
4. Deploy. The free instance type works, with one caveat: it spins down after 15 minutes of inactivity, so the first request after an idle period will be slow (30-60s) or may time out in your MCP client.

Any other host that runs a persistent Node process works too — the blueprint is just the fastest path.

### Add to Claude Desktop, claude.ai, or Claude Code

- **claude.ai (web and mobile)**: Settings → Connectors → Add custom connector → enter `https://your-app.onrender.com/mcp` as the URL, leave the OAuth Client ID/Secret fields blank. Approving the connection walks you through Supabase login and consent. Once added, it's available from the Claude mobile app too, since connectors are tied to your account, not a device.
- **Claude Code**: connectors added on claude.ai sync automatically into the CLI when signed in with the same account. To add it directly instead: `claude mcp add orium --transport http https://your-app.onrender.com/mcp`, then run `/mcp` inside a session and choose **Authenticate**.
- **Claude Desktop**: consult Claude Desktop's current docs for adding a remote/HTTP MCP server — this is evolving faster than most other parts of the MCP spec.

### Where your data goes

Entries live in the Postgres database at `DATABASE_URL`. The same database — and the same running server — is reachable from any client that has authenticated via Supabase OAuth, from any machine.

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
public/
  login.html           # Supabase Auth login page (for the OAuth consent flow)
  oauth-consent.html    # OAuth authorization consent screen
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
  registerTools.ts     # registers all 10 tools on an McpServer instance
  index.ts             # HTTP server entry point: transport, auth, OAuth metadata
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
