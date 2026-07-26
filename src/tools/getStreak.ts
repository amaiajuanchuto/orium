/**
 * `get_streak` MCP tool: reports the current/longest logging streaks and
 * progress toward the next milestone.
 */
import type Database from "better-sqlite3";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addDays, toISODate } from "../db/dates.js";
import { computeCurrentStreak } from "../db/streak.js";

const MILESTONES = [7, 14, 30, 90, 180, 365];
const NUDGE_THRESHOLD_DAYS = 3;

/**
 * Finds the longest run of consecutive calendar days in a set of logged
 * dates, regardless of whether that run is still active.
 *
 * @param datesDesc - Distinct logged dates (YYYY-MM-DD), any order.
 * @returns Length of the longest consecutive-day run; 0 if empty.
 */
function computeLongestStreak(datesDesc: string[]): number {
  const datesAsc = [...datesDesc].sort();
  let longest = 0;
  let current = 0;
  let previous: string | null = null;

  for (const date of datesAsc) {
    current = previous !== null && addDays(previous, 1) === date ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = date;
  }

  return longest;
}

function buildMessage(
  streak: number,
  loggedToday: boolean,
  nextMilestone: number | null,
): string {
  if (streak === 0) {
    return "No active streak yet. Log your mood today to start one!";
  }

  const streakText = `You're on a ${streak}-day streak!`;

  if (!loggedToday) {
    return `${streakText} Log today before midnight to keep it alive.`;
  }

  if (nextMilestone !== null && nextMilestone - streak <= NUDGE_THRESHOLD_DAYS) {
    const daysLeft = nextMilestone - streak;
    const dayWord = daysLeft === 1 ? "day" : "days";
    return `${streakText} Just ${daysLeft} more ${dayWord} to hit a ${nextMilestone}-day streak — keep going!`;
  }

  return streakText;
}

/**
 * Registers the `get_streak` tool, which reports the current consecutive
 * daily-logging streak (broken by any missed calendar day), the longest
 * streak ever, and the next milestone with a motivational message.
 */
export function registerGetStreakTool(server: McpServer, db: Database.Database): void {
  server.registerTool(
    "get_streak",
    {
      title: "Get logging streak",
      description:
        "Report the current and longest consecutive daily journaling streaks, and " +
        "how close the user is to their next milestone.",
    },
    () => {
      const dates = db
        .prepare("SELECT DISTINCT date FROM entries ORDER BY date DESC")
        .all()
        .map((row) => (row as { date: string }).date);

      if (dates.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No entries yet. Log your mood today to start a streak!",
            },
          ],
        };
      }

      const today = toISODate(new Date());
      const { streak, loggedToday } = computeCurrentStreak(new Set(dates), today);
      const longestStreak = Math.max(computeLongestStreak(dates), streak);
      const nextMilestone = MILESTONES.find((m) => m > streak) ?? null;

      const result = {
        current_streak: streak,
        longest_streak: longestStreak,
        logged_today: loggedToday,
        next_milestone: nextMilestone,
        days_until_next_milestone: nextMilestone === null ? null : nextMilestone - streak,
        message: buildMessage(streak, loggedToday, nextMilestone),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
