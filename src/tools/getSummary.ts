import type Database from "better-sqlite3";
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

function getAverages(db: Database.Database, start: string, end: string): Averages {
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

function getDirection(current: number, previous: number | null): Direction {
  if (previous === null) return "stable";
  const delta = current - previous;
  if (delta > 0.5) return "up";
  if (delta < -0.5) return "down";
  return "stable";
}

function getBestDay(db: Database.Database, start: string, end: string): DayEntry {
  return db
    .prepare(
      `SELECT date, mood_rating FROM entries
       WHERE date BETWEEN ? AND ?
       ORDER BY mood_rating DESC, date ASC
       LIMIT 1`,
    )
    .get(start, end) as DayEntry;
}

function getWorstDay(db: Database.Database, start: string, end: string): DayEntry {
  return db
    .prepare(
      `SELECT date, mood_rating FROM entries
       WHERE date BETWEEN ? AND ?
       ORDER BY mood_rating ASC, date ASC
       LIMIT 1`,
    )
    .get(start, end) as DayEntry;
}

function getTopTags(db: Database.Database, start: string, end: string): TagCount[] {
  return db
    .prepare(
      `SELECT t.name AS tag, COUNT(*) AS count
       FROM entries e
       JOIN entry_tags et ON et.entry_id = e.id
       JOIN tags t ON t.id = et.tag_id
       WHERE e.date BETWEEN ? AND ?
       GROUP BY t.name
       ORDER BY count DESC, t.name ASC
       LIMIT 5`,
    )
    .all(start, end) as TagCount[];
}

function getTagImpact(
  db: Database.Database,
  start: string,
  end: string,
  overallMood: number,
): { most_positive: TagImpact | null; most_negative: TagImpact | null } {
  const rows = db
    .prepare(
      `SELECT t.name AS tag, AVG(e.mood_rating) AS avg_mood
       FROM entries e
       JOIN entry_tags et ON et.entry_id = e.id
       JOIN tags t ON t.id = et.tag_id
       WHERE e.date BETWEEN ? AND ?
       GROUP BY t.name`,
    )
    .all(start, end) as Array<{ tag: string; avg_mood: number }>;

  if (rows.length === 0) {
    return { most_positive: null, most_negative: null };
  }

  const impacts: TagImpact[] = rows.map((row) => ({
    tag: row.tag,
    avg_mood: round(row.avg_mood),
    difference: round(row.avg_mood - overallMood),
  }));

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
export function registerGetSummaryTool(server: McpServer, db: Database.Database): void {
  server.registerTool(
    "get_summary",
    {
      title: "Get period summary",
      description:
        "Get a comprehensive review of the last week or month: averages, mood " +
        "trend, best/worst days, top tags, tag impact, streak, and a personalized message.",
      inputSchema: getSummaryInputSchema,
    },
    ({ period }) => {
      const periodDays = PERIOD_DAYS[period];
      const today = toISODate(new Date());

      const currentStart = addDays(today, -(periodDays - 1));
      const currentEnd = today;
      const previousEnd = addDays(currentStart, -1);
      const previousStart = addDays(previousEnd, -(periodDays - 1));

      const averages = getAverages(db, currentStart, currentEnd);

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

      const previousAverages = getAverages(db, previousStart, previousEnd);
      const previousMood =
        previousAverages.entry_count > 0 ? previousAverages.mood_rating : null;
      const trendDirection = getDirection(averages.mood_rating!, previousMood);
      const trendDifference =
        previousMood === null ? null : round(averages.mood_rating! - previousMood);

      const bestDay = getBestDay(db, currentStart, currentEnd);
      const worstDay = getWorstDay(db, currentStart, currentEnd);
      const topTags = getTopTags(db, currentStart, currentEnd);
      const tagImpact = getTagImpact(db, currentStart, currentEnd, averages.mood_rating!);

      const allDates = db
        .prepare("SELECT DISTINCT date FROM entries ORDER BY date DESC")
        .all()
        .map((row) => (row as { date: string }).date);
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
