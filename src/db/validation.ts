/**
 * Shared zod schemas reused across multiple tool input schemas.
 */
import { z } from "zod";
import { DATE_REGEX } from "./types.js";

/** A YYYY-MM-DD date string that cannot be later than today. */
export const dateSchema = z
  .string()
  .regex(DATE_REGEX, "date must be in YYYY-MM-DD format")
  .refine(
    (date) => date <= new Date().toISOString().slice(0, 10),
    "date cannot be in the future",
  );
