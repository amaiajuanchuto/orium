import { addDays } from "./dates.js";

/**
 * Computes the current consecutive daily-logging streak ending today (or
 * yesterday, if today hasn't been logged yet but the streak is still
 * alive until midnight).
 */
export function computeCurrentStreak(
  dateSet: Set<string>,
  today: string,
): { streak: number; loggedToday: boolean } {
  const loggedToday = dateSet.has(today);
  let cursor = loggedToday ? today : addDays(today, -1);

  if (!dateSet.has(cursor)) {
    return { streak: 0, loggedToday };
  }

  let streak = 0;
  while (dateSet.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  return { streak, loggedToday };
}
