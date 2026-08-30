/**
 * Shared zod schemas reused across multiple tool input schemas.
 */
import { z } from "zod";
import { DATE_REGEX } from "./types.js";

/**
 * A YYYY-MM-DD date string that cannot be later than today. Tolerates one
 * extra day ahead of the server's UTC clock: the server has no per-user
 * timezone, so a user in a UTC+N zone can have a local "today" that's
 * already tomorrow in UTC (up to UTC+14) — reject only dates that can't be
 * "today" in any real timezone.
 */
export const dateSchema = z
  .string()
  .regex(DATE_REGEX, "date must be in YYYY-MM-DD format")
  .refine((date) => date <= tomorrowUTC(), "date cannot be in the future");

function tomorrowUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Free-text note field shared by entries and profiles. */
export const notesSchema = z.string().max(10_000);

/** A single tag name. */
export const tagSchema = z.string().min(1).max(50);

/** The `tags` array accepted by entry create/update. */
export const tagsArraySchema = z.array(tagSchema).max(20);

/** Short free-text profile field (name, pronouns, work, etc.). */
export const profileTextSchema = z.string().max(500);

/** A list-style profile field (exercise, hobbies): short strings, capped count. */
export const profileListSchema = z.array(z.string().min(1).max(200)).max(20);
