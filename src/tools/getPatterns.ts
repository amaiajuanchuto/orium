/**
 * `get_patterns` MCP tool: finds the strongest mood correlations across
 * sleep buckets, day of week, and tags.
 */
import type postgres from "postgres";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const MIN_SAMPLE_SIZE = 5;

const SLEEP_BUCKET_LABELS: Record<string, string> = {
  under_6: "under 6 hours",
  six_to_seven: "6–7 hours",
  seven_to_eight: "7–8 hours",
  eight_plus: "8+ hours",
};

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface Pattern {
  type: "sleep" | "day_of_week" | "tag";
  summary: string;
  effect_size: number;
  tip: string;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Compares average mood across sleep-duration buckets (<6h, 6–7h, 7–8h,
 * 8h+) and reports the best vs. worst bucket, if each has at least
 * `MIN_SAMPLE_SIZE` entries.
 *
 * @param sql - Open database connection.
 * @param userId - The authenticated user's id.
 * @returns The sleep pattern, or null if fewer than two buckets qualify.
 */
async function getSleepPattern(
  sql: postgres.Sql,
  userId: string,
): Promise<Pattern | null> {
  const rows = await sql<{ bucket: string; avg_mood: number; count: number }[]>`
    SELECT
      CASE
        WHEN sleep_hours < 6 THEN 'under_6'
        WHEN sleep_hours < 7 THEN 'six_to_seven'
        WHEN sleep_hours < 8 THEN 'seven_to_eight'
        ELSE 'eight_plus'
      END AS bucket,
      AVG(mood_rating) AS avg_mood,
      COUNT(*)::int AS count
    FROM entries
    WHERE user_id = ${userId} AND sleep_hours IS NOT NULL
    GROUP BY bucket
    HAVING COUNT(*) >= ${MIN_SAMPLE_SIZE}
  `;

  if (rows.length < 2) return null;

  const withNumericMood = rows.map((row) => ({ ...row, avg_mood: Number(row.avg_mood) }));

  const best = withNumericMood.reduce((a, b) => (b.avg_mood > a.avg_mood ? b : a));
  const worst = withNumericMood.reduce((a, b) => (b.avg_mood < a.avg_mood ? b : a));

  const bestLabel = SLEEP_BUCKET_LABELS[best.bucket]!;
  const worstLabel = SLEEP_BUCKET_LABELS[worst.bucket]!;
  const bestAvg = round(best.avg_mood);
  const worstAvg = round(worst.avg_mood);

  return {
    type: "sleep",
    summary:
      `When you sleep ${bestLabel}, your average mood is ${bestAvg} ` +
      `(based on ${best.count} entries), compared to ${worstAvg} when you sleep ` +
      `${worstLabel} (based on ${worst.count} entries).`,
    effect_size: round(bestAvg - worstAvg),
    tip: `Try to get ${bestLabel} of sleep when possible — that's when your mood tends to be highest.`,
  };
}

/**
 * Compares average mood across days of the week and reports the best vs.
 * worst day, if each has at least `MIN_SAMPLE_SIZE` entries.
 *
 * @param sql - Open database connection.
 * @param userId - The authenticated user's id.
 * @returns The day-of-week pattern, or null if fewer than two days qualify.
 */
async function getDayOfWeekPattern(
  sql: postgres.Sql,
  userId: string,
): Promise<Pattern | null> {
  const rows = await sql<{ dow: number; avg_mood: number; count: number }[]>`
    SELECT EXTRACT(DOW FROM date)::int AS dow, AVG(mood_rating) AS avg_mood, COUNT(*)::int AS count
    FROM entries
    WHERE user_id = ${userId}
    GROUP BY dow
    HAVING COUNT(*) >= ${MIN_SAMPLE_SIZE}
  `;

  if (rows.length < 2) return null;

  const withNumericMood = rows.map((row) => ({ ...row, avg_mood: Number(row.avg_mood) }));

  const best = withNumericMood.reduce((a, b) => (b.avg_mood > a.avg_mood ? b : a));
  const worst = withNumericMood.reduce((a, b) => (b.avg_mood < a.avg_mood ? b : a));

  const bestDay = WEEKDAY_NAMES[best.dow]!;
  const worstDay = WEEKDAY_NAMES[worst.dow]!;
  const bestAvg = round(best.avg_mood);
  const worstAvg = round(worst.avg_mood);

  return {
    type: "day_of_week",
    summary:
      `Your mood is highest on ${bestDay}s (average ${bestAvg}, ${best.count} entries) ` +
      `and lowest on ${worstDay}s (average ${worstAvg}, ${worst.count} entries).`,
    effect_size: round(bestAvg - worstAvg),
    tip:
      `Consider what makes ${bestDay}s better and see if you can bring some of that ` +
      `into your ${worstDay}s, or plan lighter/restorative activities then.`,
  };
}

/**
 * Compares each tag's average mood against the overall average mood, for
 * every tag with at least `MIN_SAMPLE_SIZE` tagged entries.
 *
 * @param sql - Open database connection.
 * @param userId - The authenticated user's id.
 * @returns One pattern per qualifying tag; empty if there are no entries yet.
 */
async function getTagPatterns(sql: postgres.Sql, userId: string): Promise<Pattern[]> {
  const [overall] = await sql<{ avg_mood: number | null }[]>`
    SELECT AVG(mood_rating) AS avg_mood FROM entries WHERE user_id = ${userId}
  `;

  if (overall!.avg_mood === null) return [];

  const overallAvg = round(Number(overall!.avg_mood));

  const rows = await sql<{ tag: string; avg_mood: number; count: number }[]>`
    SELECT t.name AS tag, AVG(e.mood_rating) AS avg_mood, COUNT(*)::int AS count
    FROM entries e
    JOIN entry_tags et ON et.entry_id = e.id
    JOIN tags t ON t.id = et.tag_id
    WHERE e.user_id = ${userId}
    GROUP BY t.name
    HAVING COUNT(*) >= ${MIN_SAMPLE_SIZE}
  `;

  return rows.map((row) => {
    const withAvg = round(Number(row.avg_mood));
    const effectSize = round(withAvg - overallAvg);
    const sign = effectSize >= 0 ? "+" : "";

    const tip =
      effectSize >= 0
        ? `Try to make more room for "${row.tag}" in your routine — it tends to lift your mood.`
        : `It might be worth reflecting on what's happening around "${row.tag}" days and how to soften its impact.`;

    return {
      type: "tag" as const,
      summary:
        `Days tagged "${row.tag}" average ${withAvg} (${row.count} entries) vs your ` +
        `overall average of ${overallAvg} (${sign}${effectSize}).`,
      effect_size: effectSize,
      tip,
    };
  });
}

/**
 * Registers the `get_patterns` tool, which surfaces the strongest
 * correlations between mood and sleep duration, day of week, and tags —
 * each with numbers and a tip — or a friendly message if there isn't
 * enough data yet.
 */
export function registerGetPatternsTool(
  server: McpServer,
  sql: postgres.Sql,
  userId: string,
): void {
  server.registerTool(
    "get_patterns",
    {
      title: "Get mood patterns",
      description:
        "Find the strongest patterns in what affects your mood: sleep duration, " +
        "day of week, and tags. Requires at least 5 entries per group to surface a pattern.",
    },
    async () => {
      const candidates: Pattern[] = [
        await getSleepPattern(sql, userId),
        await getDayOfWeekPattern(sql, userId),
        ...(await getTagPatterns(sql, userId)),
      ].filter((pattern): pattern is Pattern => pattern !== null);

      if (candidates.length === 0) {
        return {
          content: [
            {
              type: "text",
              text:
                "Not enough data yet to find patterns in what affects your mood. Keep " +
                "logging entries (especially sleep hours and tags) and check back soon!",
            },
          ],
        };
      }

      const topPatterns = candidates
        .sort((a, b) => Math.abs(b.effect_size) - Math.abs(a.effect_size))
        .slice(0, 3);

      return {
        content: [
          { type: "text", text: JSON.stringify({ patterns: topPatterns }, null, 2) },
        ],
      };
    },
  );
}
