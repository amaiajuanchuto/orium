/**
 * `get_summary` MCP tool: Orium's comprehensive week/month review,
 * combining averages, trend, best/worst days, tags, and streak.
 */
import type postgres from "postgres";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addDays, round, toISODate } from "../db/dates.js";
import { computeCurrentStreak } from "../db/streak.js";

const PERIOD_DAYS = { week: 7, month: 30 } as const;
const STREAK_NUDGE_THRESHOLD = 7;
const TAG_IMPACT_NUDGE_THRESHOLD = 0.5;

const getSummaryInputSchema = {
  period: z.enum(["week", "month"]),
};

type Direction = "up" | "down" | "stable";

interface Averages {
  mood_rating: number | null;
  energy_level: number | null;
  sleep_hours: number | null;
  entry_count: number;
}

interface DayEntry {
  date: string;
  mood_rating: number;
}

interface TagCount {
  tag: string;
  count: number;
}

interface TagImpact {
  tag: string;
  avg_mood: number;
  difference: number;
}

/**
 * Averages mood, energy, and sleep over an inclusive date range.
 *
 * @param sql - Open database connection.
 * @param start - Range start date (YYYY-MM-DD), inclusive.
 * @param end - Range end date (YYYY-MM-DD), inclusive.
 * @returns Rounded averages and the number of entries the range covered.
 */
async function getAverages(sql: postgres.Sql, start: string, end: string): Promise<Averages> {
  const [row] = await sql<
    {
      mood_rating: number | null;
      energy_level: number | null;
      sleep_hours: number | null;
      entry_count: number;
    }[]
  >`
    SELECT AVG(mood_rating) AS mood_rating,
           AVG(energy_level) AS energy_level,
           AVG(sleep_hours) AS sleep_hours,
           COUNT(*)::int AS entry_count
    FROM entries
    WHERE date BETWEEN ${start} AND ${end}
  `;

  return {
    mood_rating: round(row!.mood_rating === null ? null : Number(row!.mood_rating)),
    energy_level: round(row!.energy_level === null ? null : Number(row!.energy_level)),
    sleep_hours: round(row!.sleep_hours === null ? null : Number(row!.sleep_hours)),
    entry_count: row!.entry_count,
  };
}

/**
 * Classifies the change from `previous` to `current` as up/down/stable,
 * using a ±0.5 dead zone so small noise doesn't register as a trend.
 *
 * @param current - Current period's average mood.
 * @param previous - Prior period's average mood, or null if no data.
 * @returns "stable" whenever `previous` is null.
 */
function getDirection(current: number, previous: number | null): Direction {
  if (previous === null) return "stable";
  const delta = current - previous;
  if (delta > 0.5) return "up";
  if (delta < -0.5) return "down";
  return "stable";
}

/**
 * Finds the single highest-mood entry within an inclusive date range.
 *
 * @param sql - Open database connection.
 * @param start - Range start date (YYYY-MM-DD), inclusive.
 * @param end - Range end date (YYYY-MM-DD), inclusive.
 * @returns The date and mood rating of the best-rated entry.
 */
async function getBestDay(sql: postgres.Sql, start: string, end: string): Promise<DayEntry> {
  const [row] = await sql<DayEntry[]>`
    SELECT date, mood_rating FROM entries
    WHERE date BETWEEN ${start} AND ${end}
    ORDER BY mood_rating DESC, date ASC
    LIMIT 1
  `;
  return row!;
}

/**
 * Finds the single lowest-mood entry within an inclusive date range.
 *
 * @param sql - Open database connection.
 * @param start - Range start date (YYYY-MM-DD), inclusive.
 * @param end - Range end date (YYYY-MM-DD), inclusive.
 * @returns The date and mood rating of the worst-rated entry.
 */
async function getWorstDay(sql: postgres.Sql, start: string, end: string): Promise<DayEntry> {
  const [row] = await sql<DayEntry[]>`
    SELECT date, mood_rating FROM entries
    WHERE date BETWEEN ${start} AND ${end}
    ORDER BY mood_rating ASC, date ASC
    LIMIT 1
  `;
  return row!;
}

/**
 * Finds the 5 most-used tags within an inclusive date range.
 *
 * @param sql - Open database connection.
 * @param start - Range start date (YYYY-MM-DD), inclusive.
 * @param end - Range end date (YYYY-MM-DD), inclusive.
 * @returns Up to 5 tags with their usage counts, most-used first.
 */
async function getTopTags(sql: postgres.Sql, start: string, end: string): Promise<TagCount[]> {
  return sql<TagCount[]>`
    SELECT t.name AS tag, COUNT(*)::int AS count
    FROM entries e
    JOIN entry_tags et ON et.entry_id = e.id
    JOIN tags t ON t.id = et.tag_id
    WHERE e.date BETWEEN ${start} AND ${end}
    GROUP BY t.name
    ORDER BY count DESC, t.name ASC
    LIMIT 5
  `;
}

/**
 * Finds the tags with the most positive and most negative effect on mood
 * within an inclusive date range, each measured as the tag's average mood
 * minus the period's overall average mood.
 *
 * @param sql - Open database connection.
 * @param start - Range start date (YYYY-MM-DD), inclusive.
 * @param end - Range end date (YYYY-MM-DD), inclusive.
 * @param overallMood - The period's overall average mood, for comparison.
 * @returns The most positive/negative tag impacts, or null if no tags used.
 */
async function getTagImpact(
  sql: postgres.Sql,
  start: string,
  end: string,
  overallMood: number,
): Promise<{ most_positive: TagImpact | null; most_negative: TagImpact | null }> {
  const rows = await sql<{ tag: string; avg_mood: number }[]>`
    SELECT t.name AS tag, AVG(e.mood_rating) AS avg_mood
    FROM entries e
    JOIN entry_tags et ON et.entry_id = e.id
    JOIN tags t ON t.id = et.tag_id
    WHERE e.date BETWEEN ${start} AND ${end}
    GROUP BY t.name
  `;

  if (rows.length === 0) {
    return { most_positive: null, most_negative: null };
  }

  const impacts: TagImpact[] = rows.map((row) => {
    const avgMood = Number(row.avg_mood);
    return {
      tag: row.tag,
      avg_mood: round(avgMood),
      difference: round(avgMood - overallMood),
    };
  });

  const most_positive = impacts.reduce((a, b) => (b.difference > a.difference ? b : a));
  const most_negative = impacts.reduce((a, b) => (b.difference < a.difference ? b : a));

  return { most_positive, most_negative };
}

/**
 * Picks the single most relevant, data-driven motivational message by
 * scoring each qualifying signal (mood trend, tag impact, streak) on a
 * comparable scale and returning the strongest one. Falls back to a
 * neutral entry-count message when no signal stands out.
 */
function buildMessage(
  period: "week" | "month",
  trendDirection: Direction,
  trendDifference: number | null,
  tagImpact: { most_positive: TagImpact | null },
  currentStreak: number,
  entryCount: number,
): string {
  const candidates: Array<{ strength: number; message: string }> = [];

  if (trendDirection === "up" && trendDifference !== null) {
    candidates.push({
      strength: trendDifference,
      message: `Your mood has improved by ${trendDifference} points this ${period}. Whatever you're doing, keep it up!`,
    });
  }

  if (
    tagImpact.most_positive !== null &&
    tagImpact.most_positive.difference > TAG_IMPACT_NUDGE_THRESHOLD
  ) {
    candidates.push({
      strength: tagImpact.most_positive.difference,
      message: `Days you tagged "${tagImpact.most_positive.tag}" averaged ${tagImpact.most_positive.difference} points higher than your overall average. Keep it going!`,
    });
  }

  if (trendDirection === "down" && trendDifference !== null) {
    candidates.push({
      strength: Math.abs(trendDifference),
      message: `It's been a tough ${period}, but you're still showing up and logging. That consistency matters.`,
    });
  }

  if (currentStreak >= STREAK_NUDGE_THRESHOLD) {
    candidates.push({
      strength: Math.min(currentStreak / STREAK_NUDGE_THRESHOLD, 3),
      message: `${currentStreak} days in a row! Showing up for yourself is a superpower.`,
    });
  }

  if (candidates.length === 0) {
    const entryWord = entryCount === 1 ? "entry" : "entries";
    return `You logged ${entryCount} ${entryWord} this ${period}. Keep showing up for yourself.`;
  }

  return candidates.reduce((a, b) => (b.strength > a.strength ? b : a)).message;
}

/**
 * Registers the `get_summary` tool: Orium's comprehensive period review,
 * combining averages, trend, best/worst days, top tags, tag impact, and
 * streak into one data-driven summary with a personalized message.
 */
export function registerGetSummaryTool(server: McpServer, sql: postgres.Sql): void {
  server.registerTool(
    "get_summary",
    {
      title: "Get period summary",
      description:
        "Get a comprehensive review of the last week or month: averages, mood " +
        "trend, best/worst days, top tags, tag impact, streak, and a personalized message.",
      inputSchema: getSummaryInputSchema,
    },
    async ({ period }) => {
      const periodDays = PERIOD_DAYS[period];
      const today = toISODate(new Date());

      const currentStart = addDays(today, -(periodDays - 1));
      const currentEnd = today;
      const previousEnd = addDays(currentStart, -1);
      const previousStart = addDays(previousEnd, -(periodDays - 1));

      const averages = await getAverages(sql, currentStart, currentEnd);

      if (averages.entry_count === 0) {
        return {
          content: [
            {
              type: "text",
              text: `You haven't logged any entries this ${period} yet. Start today and your first summary will be waiting for you!`,
            },
          ],
        };
      }

      const previousAverages = await getAverages(sql, previousStart, previousEnd);
      const previousMood =
        previousAverages.entry_count > 0 ? previousAverages.mood_rating : null;
      const trendDirection = getDirection(averages.mood_rating!, previousMood);
      const trendDifference =
        previousMood === null ? null : round(averages.mood_rating! - previousMood);

      const bestDay = await getBestDay(sql, currentStart, currentEnd);
      const worstDay = await getWorstDay(sql, currentStart, currentEnd);
      const topTags = await getTopTags(sql, currentStart, currentEnd);
      const tagImpact = await getTagImpact(
        sql,
        currentStart,
        currentEnd,
        averages.mood_rating!,
      );

      const allDates = (
        await sql<
          { date: string }[]
        >`SELECT DISTINCT date FROM entries ORDER BY date DESC`
      ).map((row) => row.date);
      const { streak: currentStreak } = computeCurrentStreak(new Set(allDates), today);

      const message = buildMessage(
        period,
        trendDirection,
        trendDifference,
        tagImpact,
        currentStreak,
        averages.entry_count,
      );

      const result = {
        period,
        entry_count: averages.entry_count,
        averages: {
          mood_rating: averages.mood_rating,
          energy_level: averages.energy_level,
          sleep_hours: averages.sleep_hours,
        },
        trend: {
          direction: trendDirection,
          difference: trendDifference,
          current_avg_mood: averages.mood_rating,
          previous_avg_mood: previousMood,
        },
        best_day: bestDay,
        worst_day: worstDay,
        top_tags: topTags,
        tag_impact: tagImpact,
        current_streak: currentStreak,
        message,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
