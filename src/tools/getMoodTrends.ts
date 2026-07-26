/**
 * `get_mood_trends` MCP tool: compares recent averages against the prior
 * equivalent period.
 */
import type Database from "better-sqlite3";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addDays, round, toISODate } from "../db/dates.js";

const PERIOD_DAYS = {
  week: 7,
  month: 30,
  quarter: 90,
} as const;

const getMoodTrendsInputSchema = {
  period: z.enum(["week", "month", "quarter"]),
};

interface PeriodAverages {
  mood_rating: number | null;
  energy_level: number | null;
  sleep_hours: number | null;
  entry_count: number;
}

type Direction = "up" | "down" | "stable";

/**
 * Averages mood, energy, and sleep over an inclusive date range.
 *
 * @param db - Open database connection.
 * @param start - Range start date (YYYY-MM-DD), inclusive.
 * @param end - Range end date (YYYY-MM-DD), inclusive.
 * @returns Rounded averages and the number of entries the range covered.
 */
function getPeriodAverages(
  db: Database.Database,
  start: string,
  end: string,
): PeriodAverages {
  const row = db
    .prepare(
      `SELECT AVG(mood_rating) AS mood_rating,
              AVG(energy_level) AS energy_level,
              AVG(sleep_hours) AS sleep_hours,
              COUNT(*) AS entry_count
       FROM entries
       WHERE date BETWEEN ? AND ?`,
    )
    .get(start, end) as {
    mood_rating: number | null;
    energy_level: number | null;
    sleep_hours: number | null;
    entry_count: number;
  };

  return {
    mood_rating: round(row.mood_rating),
    energy_level: round(row.energy_level),
    sleep_hours: round(row.sleep_hours),
    entry_count: row.entry_count,
  };
}

/**
 * Classifies the change from `previous` to `current` as up/down/stable,
 * using a ±0.5 dead zone so small noise doesn't register as a trend.
 *
 * @param current - Current period's average, or null if no data.
 * @param previous - Prior period's average, or null if no data.
 * @returns "stable" whenever either value is null.
 */
function getDirection(current: number | null, previous: number | null): Direction {
  if (current === null || previous === null) {
    return "stable";
  }

  const delta = current - previous;
  if (delta > 0.5) return "up";
  if (delta < -0.5) return "down";
  return "stable";
}

/**
 * Registers the `get_mood_trends` tool, which compares average mood,
 * energy, and sleep over the last 7/30/90 days against the equivalent
 * prior period.
 */
export function registerGetMoodTrendsTool(
  server: McpServer,
  db: Database.Database,
): void {
  server.registerTool(
    "get_mood_trends",
    {
      title: "Get mood trends",
      description:
        "Compare average mood, energy, and sleep over the last week, month, or " +
        "quarter against the equivalent prior period.",
      inputSchema: getMoodTrendsInputSchema,
    },
    ({ period }) => {
      const periodDays = PERIOD_DAYS[period];
      const today = toISODate(new Date());

      const currentStart = addDays(today, -(periodDays - 1));
      const currentEnd = today;
      const previousEnd = addDays(currentStart, -1);
      const previousStart = addDays(previousEnd, -(periodDays - 1));

      const current = getPeriodAverages(db, currentStart, currentEnd);

      if (current.entry_count === 0) {
        return {
          content: [
            {
              type: "text",
              text: "Not enough data yet for this period. Log a few entries and check back!",
            },
          ],
        };
      }

      const previous = getPeriodAverages(db, previousStart, previousEnd);

      const result = {
        period,
        current_period: { start: currentStart, end: currentEnd, ...current },
        previous_period: { start: previousStart, end: previousEnd, ...previous },
        mood_direction: getDirection(current.mood_rating, previous.mood_rating),
        energy_direction: getDirection(current.energy_level, previous.energy_level),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
