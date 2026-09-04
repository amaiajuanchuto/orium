/**
 * Core analytics/insights logic (streaks, summaries, trends, patterns),
 * shared between the MCP tools and the REST API. Returns plain structured
 * data (null/empty for "not enough data") — any chat-style friendly
 * messages for the *absence* of data are the caller's job to add. The
 * data-driven `message` fields these functions do produce (e.g. get_streak's
 * motivational nudge) are considered part of the data itself, useful to
 * any consumer, so they stay here.
 */
import type postgres from "postgres";
import { addDays, round, toISODate } from "../db/dates.js";
import { computeCurrentStreak } from "../db/streak.js";
import { welchTTest } from "../db/stats.js";

const MILESTONES = [7, 14, 30, 90, 180, 365];
const STREAK_NUDGE_THRESHOLD_DAYS = 3;
const SUMMARY_PERIOD_DAYS = { week: 7, month: 30 } as const;
const TRENDS_PERIOD_DAYS = { week: 7, month: 30, quarter: 90 } as const;
const STREAK_NUDGE_THRESHOLD = 7;
const TAG_IMPACT_NUDGE_THRESHOLD = 0.5;
// 5 entries per group was enough to clear the significance test below, but
// a t-test on that few points is still fragile — one outlier can flip the
// result. 10 is a firmer floor without making patterns take forever to
// appear for a daily-journaling app.
const PATTERN_MIN_SAMPLE_SIZE = 10;
// Below this many entries per group, a pattern still gets surfaced (it
// passed significance) but is framed as an early signal rather than a
// settled fact — small samples are more prone to reflecting a short-lived
// coincidence than a real, stable effect.
const PATTERN_CONFIDENT_SAMPLE_SIZE = 20;
// A pattern is only surfaced if a Welch's t-test on the two groups being
// compared rejects the "no real difference" null hypothesis at this level —
// i.e. there's a <5% chance the observed gap is just sampling noise. This is
// the conventional significance threshold; it does not claim causation, only
// that the association is unlikely to be a coincidence in the data itself.
const PATTERN_SIGNIFICANCE_ALPHA = 0.05;

/** Appended to a pattern's summary when either compared group is still a small sample. */
const EARLY_SIGNAL_NOTE =
  " Still an early signal with this few entries — keep logging for a clearer picture.";

/** Wraps a summary with the early-signal caveat if either group is below the confident-sample bar. */
function withConfidenceNote(summary: string, ...groupCounts: number[]): string {
  const isEarly = groupCounts.some((count) => count < PATTERN_CONFIDENT_SAMPLE_SIZE);
  return isEarly ? summary + EARLY_SIGNAL_NOTE : summary;
}

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

type Direction = "up" | "down" | "stable";

// ---------------------------------------------------------------------------
// get_streak
// ---------------------------------------------------------------------------

export interface StreakResult {
  current_streak: number;
  longest_streak: number;
  logged_today: boolean;
  next_milestone: number | null;
  days_until_next_milestone: number | null;
  message: string;
}

/**
 * Finds the longest run of consecutive calendar days in a set of logged
 * dates, regardless of whether that run is still active.
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

function buildStreakMessage(
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

  if (nextMilestone !== null && nextMilestone - streak <= STREAK_NUDGE_THRESHOLD_DAYS) {
    const daysLeft = nextMilestone - streak;
    const dayWord = daysLeft === 1 ? "day" : "days";
    return `${streakText} Just ${daysLeft} more ${dayWord} to hit a ${nextMilestone}-day streak — keep going!`;
  }

  return streakText;
}

/**
 * Reports the current consecutive daily-logging streak (broken by any
 * missed calendar day), the longest streak ever, and the next milestone.
 *
 * @param sql - Open database connection.
 * @param userId - The authenticated user's id.
 * @returns The streak report, or null if the user has no entries yet.
 */
export async function getStreak(
  sql: postgres.Sql,
  userId: string,
): Promise<StreakResult | null> {
  const dates = (
    await sql<{ date: string }[]>`
      SELECT DISTINCT date FROM entries WHERE user_id = ${userId} ORDER BY date DESC
    `
  ).map((row) => row.date);

  if (dates.length === 0) return null;

  const today = toISODate(new Date());
  const { streak, loggedToday } = computeCurrentStreak(new Set(dates), today);
  const longestStreak = Math.max(computeLongestStreak(dates), streak);
  const nextMilestone = MILESTONES.find((m) => m > streak) ?? null;

  return {
    current_streak: streak,
    longest_streak: longestStreak,
    logged_today: loggedToday,
    next_milestone: nextMilestone,
    days_until_next_milestone: nextMilestone === null ? null : nextMilestone - streak,
    message: buildStreakMessage(streak, loggedToday, nextMilestone),
  };
}

// ---------------------------------------------------------------------------
// get_summary
// ---------------------------------------------------------------------------

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

export interface SummaryResult {
  period: "week" | "month";
  entry_count: number;
  averages: {
    mood_rating: number | null;
    energy_level: number | null;
    sleep_hours: number | null;
  };
  trend: {
    direction: Direction;
    difference: number | null;
    current_avg_mood: number | null;
    previous_avg_mood: number | null;
  };
  best_day: DayEntry;
  worst_day: DayEntry;
  top_tags: TagCount[];
  tag_impact: { most_positive: TagImpact | null; most_negative: TagImpact | null };
  current_streak: number;
  message: string;
}

/** Averages mood, energy, and sleep over an inclusive date range. */
async function getAverages(
  sql: postgres.Sql,
  userId: string,
  start: string,
  end: string,
): Promise<Averages> {
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
    WHERE user_id = ${userId} AND date BETWEEN ${start} AND ${end}
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
 */
function getDirection(current: number | null, previous: number | null): Direction {
  if (current === null || previous === null) return "stable";
  const delta = current - previous;
  if (delta > 0.5) return "up";
  if (delta < -0.5) return "down";
  return "stable";
}

async function getBestDay(
  sql: postgres.Sql,
  userId: string,
  start: string,
  end: string,
): Promise<DayEntry> {
  const [row] = await sql<DayEntry[]>`
    SELECT date, mood_rating FROM entries
    WHERE user_id = ${userId} AND date BETWEEN ${start} AND ${end}
    ORDER BY mood_rating DESC, date ASC
    LIMIT 1
  `;
  return row!;
}

async function getWorstDay(
  sql: postgres.Sql,
  userId: string,
  start: string,
  end: string,
): Promise<DayEntry> {
  const [row] = await sql<DayEntry[]>`
    SELECT date, mood_rating FROM entries
    WHERE user_id = ${userId} AND date BETWEEN ${start} AND ${end}
    ORDER BY mood_rating ASC, date ASC
    LIMIT 1
  `;
  return row!;
}

async function getTopTags(
  sql: postgres.Sql,
  userId: string,
  start: string,
  end: string,
): Promise<TagCount[]> {
  return sql<TagCount[]>`
    SELECT t.name AS tag, COUNT(*)::int AS count
    FROM entries e
    JOIN entry_tags et ON et.entry_id = e.id
    JOIN tags t ON t.id = et.tag_id
    WHERE e.user_id = ${userId} AND e.date BETWEEN ${start} AND ${end}
    GROUP BY t.name
    ORDER BY count DESC, t.name ASC
    LIMIT 5
  `;
}

/**
 * Finds the tags with the most positive and most negative effect on mood
 * within an inclusive date range, each measured as the tag's average mood
 * minus the period's overall average mood.
 */
async function getTagImpact(
  sql: postgres.Sql,
  userId: string,
  start: string,
  end: string,
  overallMood: number,
): Promise<{ most_positive: TagImpact | null; most_negative: TagImpact | null }> {
  const rows = await sql<{ tag: string; avg_mood: number }[]>`
    SELECT t.name AS tag, AVG(e.mood_rating) AS avg_mood
    FROM entries e
    JOIN entry_tags et ON et.entry_id = e.id
    JOIN tags t ON t.id = et.tag_id
    WHERE e.user_id = ${userId} AND e.date BETWEEN ${start} AND ${end}
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
function buildSummaryMessage(
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
 * Orium's comprehensive period review, combining averages, trend,
 * best/worst days, top tags, tag impact, and streak into one data-driven
 * summary with a personalized message.
 *
 * @param sql - Open database connection.
 * @param userId - The authenticated user's id.
 * @param period - "week" or "month".
 * @returns The summary, or null if the user has no entries in this period.
 */
export async function getSummary(
  sql: postgres.Sql,
  userId: string,
  period: "week" | "month",
): Promise<SummaryResult | null> {
  const periodDays = SUMMARY_PERIOD_DAYS[period];
  const today = toISODate(new Date());

  const currentStart = addDays(today, -(periodDays - 1));
  const currentEnd = today;
  const previousEnd = addDays(currentStart, -1);
  const previousStart = addDays(previousEnd, -(periodDays - 1));

  const averages = await getAverages(sql, userId, currentStart, currentEnd);
  if (averages.entry_count === 0) return null;

  const previousAverages = await getAverages(sql, userId, previousStart, previousEnd);
  const previousMood =
    previousAverages.entry_count > 0 ? previousAverages.mood_rating : null;
  const trendDirection = getDirection(averages.mood_rating, previousMood);
  const trendDifference =
    previousMood === null || averages.mood_rating === null
      ? null
      : round(averages.mood_rating - previousMood);

  const bestDay = await getBestDay(sql, userId, currentStart, currentEnd);
  const worstDay = await getWorstDay(sql, userId, currentStart, currentEnd);
  const topTags = await getTopTags(sql, userId, currentStart, currentEnd);
  const tagImpact = await getTagImpact(
    sql,
    userId,
    currentStart,
    currentEnd,
    averages.mood_rating!,
  );

  const allDates = (
    await sql<{ date: string }[]>`
      SELECT DISTINCT date FROM entries WHERE user_id = ${userId} ORDER BY date DESC
    `
  ).map((row) => row.date);
  const { streak: currentStreak } = computeCurrentStreak(new Set(allDates), today);

  const message = buildSummaryMessage(
    period,
    trendDirection,
    trendDifference,
    tagImpact,
    currentStreak,
    averages.entry_count,
  );

  return {
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
}

// ---------------------------------------------------------------------------
// get_mood_trends
// ---------------------------------------------------------------------------

interface PeriodAverages {
  mood_rating: number | null;
  energy_level: number | null;
  sleep_hours: number | null;
  entry_count: number;
}

export interface MoodTrendsResult {
  period: "week" | "month" | "quarter";
  current_period: { start: string; end: string } & PeriodAverages;
  previous_period: { start: string; end: string } & PeriodAverages;
  mood_direction: Direction;
  energy_direction: Direction;
}

async function getPeriodAverages(
  sql: postgres.Sql,
  userId: string,
  start: string,
  end: string,
): Promise<PeriodAverages> {
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
    WHERE user_id = ${userId} AND date BETWEEN ${start} AND ${end}
  `;

  return {
    mood_rating: round(row!.mood_rating === null ? null : Number(row!.mood_rating)),
    energy_level: round(row!.energy_level === null ? null : Number(row!.energy_level)),
    sleep_hours: round(row!.sleep_hours === null ? null : Number(row!.sleep_hours)),
    entry_count: row!.entry_count,
  };
}

/**
 * Compares average mood, energy, and sleep over the last week/month/quarter
 * against the equivalent prior period.
 *
 * @param sql - Open database connection.
 * @param userId - The authenticated user's id.
 * @param period - "week", "month", or "quarter".
 * @returns The comparison, or null if there's no data for the current period.
 */
export async function getMoodTrends(
  sql: postgres.Sql,
  userId: string,
  period: "week" | "month" | "quarter",
): Promise<MoodTrendsResult | null> {
  const periodDays = TRENDS_PERIOD_DAYS[period];
  const today = toISODate(new Date());

  const currentStart = addDays(today, -(periodDays - 1));
  const currentEnd = today;
  const previousEnd = addDays(currentStart, -1);
  const previousStart = addDays(previousEnd, -(periodDays - 1));

  const current = await getPeriodAverages(sql, userId, currentStart, currentEnd);
  if (current.entry_count === 0) return null;

  const previous = await getPeriodAverages(sql, userId, previousStart, previousEnd);

  return {
    period,
    current_period: { start: currentStart, end: currentEnd, ...current },
    previous_period: { start: previousStart, end: previousEnd, ...previous },
    mood_direction: getDirection(current.mood_rating, previous.mood_rating),
    energy_direction: getDirection(current.energy_level, previous.energy_level),
  };
}

// ---------------------------------------------------------------------------
// get_patterns
// ---------------------------------------------------------------------------

export interface Pattern {
  type: "sleep" | "day_of_week" | "tag";
  summary: string;
  effect_size: number;
  /** Two-tailed p-value from a Welch's t-test between the two groups this
   * pattern compares. Always < PATTERN_SIGNIFICANCE_ALPHA — patterns that
   * don't clear that bar are never returned in the first place. */
  p_value: number;
  tip: string;
}

function roundPattern(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundPValue(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Short human-readable rendering of a p-value for use inside a summary sentence. */
function formatPValue(p: number): string {
  return p < 0.001 ? "p < 0.001" : `p = ${roundPValue(p)}`;
}

/**
 * Compares average mood across sleep-duration buckets (<6h, 6–7h, 7–8h,
 * 8h+) and reports the best vs. worst bucket, if each has at least
 * `PATTERN_MIN_SAMPLE_SIZE` entries and the difference passes a Welch's
 * t-test at `PATTERN_SIGNIFICANCE_ALPHA`.
 */
async function getSleepPattern(
  sql: postgres.Sql,
  userId: string,
): Promise<Pattern | null> {
  const rows = await sql<
    { bucket: string; avg_mood: number; var_mood: number; count: number }[]
  >`
    SELECT
      CASE
        WHEN sleep_hours < 6 THEN 'under_6'
        WHEN sleep_hours < 7 THEN 'six_to_seven'
        WHEN sleep_hours < 8 THEN 'seven_to_eight'
        ELSE 'eight_plus'
      END AS bucket,
      AVG(mood_rating) AS avg_mood,
      VARIANCE(mood_rating) AS var_mood,
      COUNT(*)::int AS count
    FROM entries
    WHERE user_id = ${userId} AND sleep_hours IS NOT NULL
    GROUP BY bucket
    HAVING COUNT(*) >= ${PATTERN_MIN_SAMPLE_SIZE}
  `;

  if (rows.length < 2) return null;

  const withNumericMood = rows.map((row) => ({
    ...row,
    avg_mood: Number(row.avg_mood),
    var_mood: Number(row.var_mood),
  }));

  const best = withNumericMood.reduce((a, b) => (b.avg_mood > a.avg_mood ? b : a));
  const worst = withNumericMood.reduce((a, b) => (b.avg_mood < a.avg_mood ? b : a));

  const { pValue } = welchTTest(
    { mean: best.avg_mood, variance: best.var_mood, n: best.count },
    { mean: worst.avg_mood, variance: worst.var_mood, n: worst.count },
  );
  if (pValue >= PATTERN_SIGNIFICANCE_ALPHA) return null;

  const bestLabel = SLEEP_BUCKET_LABELS[best.bucket]!;
  const worstLabel = SLEEP_BUCKET_LABELS[worst.bucket]!;
  const bestAvg = roundPattern(best.avg_mood);
  const worstAvg = roundPattern(worst.avg_mood);

  return {
    type: "sleep",
    p_value: roundPValue(pValue),
    summary: withConfidenceNote(
      `When you sleep ${bestLabel}, your average mood is ${bestAvg} ` +
        `(based on ${best.count} entries), compared to ${worstAvg} when you sleep ` +
        `${worstLabel} (based on ${worst.count} entries). This difference is ` +
        `statistically significant (${formatPValue(pValue)}).`,
      best.count,
      worst.count,
    ),
    effect_size: roundPattern(bestAvg - worstAvg),
    tip: `Try to get ${bestLabel} of sleep when possible — that's when your mood tends to be highest.`,
  };
}

/**
 * Compares average mood across days of the week and reports the best vs.
 * worst day, if each has at least `PATTERN_MIN_SAMPLE_SIZE` entries and the
 * difference passes a Welch's t-test at `PATTERN_SIGNIFICANCE_ALPHA`.
 */
async function getDayOfWeekPattern(
  sql: postgres.Sql,
  userId: string,
): Promise<Pattern | null> {
  const rows = await sql<
    { dow: number; avg_mood: number; var_mood: number; count: number }[]
  >`
    SELECT EXTRACT(DOW FROM date)::int AS dow, AVG(mood_rating) AS avg_mood,
      VARIANCE(mood_rating) AS var_mood, COUNT(*)::int AS count
    FROM entries
    WHERE user_id = ${userId}
    GROUP BY dow
    HAVING COUNT(*) >= ${PATTERN_MIN_SAMPLE_SIZE}
  `;

  if (rows.length < 2) return null;

  const withNumericMood = rows.map((row) => ({
    ...row,
    avg_mood: Number(row.avg_mood),
    var_mood: Number(row.var_mood),
  }));

  const best = withNumericMood.reduce((a, b) => (b.avg_mood > a.avg_mood ? b : a));
  const worst = withNumericMood.reduce((a, b) => (b.avg_mood < a.avg_mood ? b : a));

  const { pValue } = welchTTest(
    { mean: best.avg_mood, variance: best.var_mood, n: best.count },
    { mean: worst.avg_mood, variance: worst.var_mood, n: worst.count },
  );
  if (pValue >= PATTERN_SIGNIFICANCE_ALPHA) return null;

  const bestDay = WEEKDAY_NAMES[best.dow]!;
  const worstDay = WEEKDAY_NAMES[worst.dow]!;
  const bestAvg = roundPattern(best.avg_mood);
  const worstAvg = roundPattern(worst.avg_mood);

  return {
    type: "day_of_week",
    p_value: roundPValue(pValue),
    summary: withConfidenceNote(
      `Your mood is highest on ${bestDay}s (average ${bestAvg}, ${best.count} entries) ` +
        `and lowest on ${worstDay}s (average ${worstAvg}, ${worst.count} entries). This ` +
        `difference is statistically significant (${formatPValue(pValue)}).`,
      best.count,
      worst.count,
    ),
    effect_size: roundPattern(bestAvg - worstAvg),
    tip:
      `Consider what makes ${bestDay}s better and see if you can bring some of that ` +
      `into your ${worstDay}s, or plan lighter/restorative activities then.`,
  };
}

/**
 * Compares each tag's average mood against the overall average mood, for
 * every tag with at least `PATTERN_MIN_SAMPLE_SIZE` tagged entries.
 */
/**
 * For every tag used at least `PATTERN_MIN_SAMPLE_SIZE` times, compares the
 * average mood on days with that tag against days *without* it (not
 * against the overall average, which would double-count the tagged days
 * themselves and understate the real gap) — then keeps only the
 * comparisons that pass a Welch's t-test at `PATTERN_SIGNIFICANCE_ALPHA`.
 */
async function getTagPatterns(sql: postgres.Sql, userId: string): Promise<Pattern[]> {
  const taggedRows = await sql<
    { tag_id: number; tag: string; avg_mood: number; var_mood: number; count: number }[]
  >`
    SELECT t.id AS tag_id, t.name AS tag, AVG(e.mood_rating) AS avg_mood,
      VARIANCE(e.mood_rating) AS var_mood, COUNT(*)::int AS count
    FROM entries e
    JOIN entry_tags et ON et.entry_id = e.id
    JOIN tags t ON t.id = et.tag_id
    WHERE e.user_id = ${userId}
    GROUP BY t.id, t.name
    HAVING COUNT(*) >= ${PATTERN_MIN_SAMPLE_SIZE}
  `;

  const patterns: Pattern[] = [];

  // One extra query per qualifying tag (typically a handful) to get the
  // "everything else" comparison group — fine at this app's scale, and
  // keeps each comparison an honest two independent groups rather than a
  // group vs. a total that includes it.
  for (const row of taggedRows) {
    const [untagged] = await sql<
      { avg_mood: number | null; var_mood: number | null; count: number }[]
    >`
      SELECT AVG(mood_rating) AS avg_mood, VARIANCE(mood_rating) AS var_mood, COUNT(*)::int AS count
      FROM entries e
      WHERE e.user_id = ${userId}
        AND NOT EXISTS (
          SELECT 1 FROM entry_tags et WHERE et.entry_id = e.id AND et.tag_id = ${row.tag_id}
        )
    `;

    if (!untagged || untagged.count < PATTERN_MIN_SAMPLE_SIZE) continue;

    const taggedAvg = Number(row.avg_mood);
    const untaggedAvg = Number(untagged.avg_mood);

    const { pValue } = welchTTest(
      { mean: taggedAvg, variance: Number(row.var_mood), n: row.count },
      { mean: untaggedAvg, variance: Number(untagged.var_mood), n: untagged.count },
    );
    if (pValue >= PATTERN_SIGNIFICANCE_ALPHA) continue;

    const withAvg = roundPattern(taggedAvg);
    const withoutAvg = roundPattern(untaggedAvg);
    const effectSize = roundPattern(withAvg - withoutAvg);
    const sign = effectSize >= 0 ? "+" : "";

    const tip =
      effectSize >= 0
        ? `Try to make more room for "${row.tag}" in your routine — it tends to lift your mood.`
        : `It might be worth reflecting on what's happening around "${row.tag}" days and how to soften its impact.`;

    patterns.push({
      type: "tag",
      p_value: roundPValue(pValue),
      summary: withConfidenceNote(
        `Days tagged "${row.tag}" average ${withAvg} (${row.count} entries) vs ${withoutAvg} ` +
          `on days without that tag (${untagged.count} entries, ${sign}${effectSize}). This ` +
          `difference is statistically significant (${formatPValue(pValue)}).`,
        row.count,
        untagged.count,
      ),
      effect_size: effectSize,
      tip,
    });
  }

  return patterns;
}

/**
 * Surfaces the strongest correlations between mood and sleep duration, day
 * of week, and tags — each with numbers and a tip. Requires at least
 * `PATTERN_MIN_SAMPLE_SIZE` entries per group, and the two groups being
 * compared must pass a Welch's
 * t-test at `PATTERN_SIGNIFICANCE_ALPHA` (default 5%) — this rules out
 * "patterns" that are just a coincidence of a small sample, though it still
 * only establishes association, not causation.
 *
 * @param sql - Open database connection.
 * @param userId - The authenticated user's id.
 * @returns Up to the top 3 statistically significant patterns by absolute
 *   effect size; empty if none qualify.
 */
export async function getPatterns(sql: postgres.Sql, userId: string): Promise<Pattern[]> {
  const candidates: Pattern[] = [
    await getSleepPattern(sql, userId),
    await getDayOfWeekPattern(sql, userId),
    ...(await getTagPatterns(sql, userId)),
  ].filter((pattern): pattern is Pattern => pattern !== null);

  return candidates
    .sort((a, b) => Math.abs(b.effect_size) - Math.abs(a.effect_size))
    .slice(0, 3);
}
