# Orium

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

## Project structure

```
src/
  db/
    schema.ts       # table definitions (source of truth)
    connection.ts   # opens the SQLite DB and applies the schema
    connection.test.ts
  index.ts          # MCP server entry point
```
