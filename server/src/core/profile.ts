/**
 * Core profile logic, shared between the REST API and (potentially) future
 * MCP tools. One row per user; upserted rather than created/updated
 * separately since a profile always conceptually exists (possibly empty).
 */
import type postgres from "postgres";
import type { Profile } from "../db/types.js";

export interface UpsertProfileInput {
  name?: string | null;
  age?: string | null;
  pronouns?: string | null;
  work?: string | null;
  work_rhythm?: string | null;
  exercise?: string[];
  diet?: string | null;
  hobbies?: string[];
  note?: string | null;
}

/**
 * Fetches the authenticated user's profile.
 *
 * @param sql - Open database connection.
 * @param userId - The authenticated user's id.
 * @returns The profile, or null if the user hasn't set one up yet.
 */
export async function getProfile(
  sql: postgres.Sql,
  userId: string,
): Promise<Profile | null> {
  const [profile] = await sql<
    Profile[]
  >`SELECT * FROM profiles WHERE user_id = ${userId}`;
  return profile ?? null;
}

/**
 * Creates or updates the authenticated user's profile: only the provided
 * fields are changed, existing fields are left as-is.
 *
 * @param sql - Open database connection.
 * @param userId - The authenticated user's id.
 * @param input - Fields to set; omitted fields are left as-is (or unset on
 *   first creation).
 * @returns The full profile after the update.
 */
export async function upsertProfile(
  sql: postgres.Sql,
  userId: string,
  input: UpsertProfileInput,
): Promise<Profile> {
  const [profile] = await sql<Profile[]>`
    INSERT INTO profiles (
      user_id, name, age, pronouns, work, work_rhythm, exercise, diet, hobbies, note
    )
    VALUES (
      ${userId}, ${input.name ?? null}, ${input.age ?? null}, ${input.pronouns ?? null},
      ${input.work ?? null}, ${input.work_rhythm ?? null}, ${input.exercise ?? []},
      ${input.diet ?? null}, ${input.hobbies ?? []}, ${input.note ?? null}
    )
    ON CONFLICT (user_id) DO UPDATE SET
      name = CASE WHEN ${input.name !== undefined} THEN EXCLUDED.name ELSE profiles.name END,
      age = CASE WHEN ${input.age !== undefined} THEN EXCLUDED.age ELSE profiles.age END,
      pronouns = CASE WHEN ${input.pronouns !== undefined} THEN EXCLUDED.pronouns ELSE profiles.pronouns END,
      work = CASE WHEN ${input.work !== undefined} THEN EXCLUDED.work ELSE profiles.work END,
      work_rhythm = CASE WHEN ${input.work_rhythm !== undefined} THEN EXCLUDED.work_rhythm ELSE profiles.work_rhythm END,
      exercise = CASE WHEN ${input.exercise !== undefined} THEN EXCLUDED.exercise ELSE profiles.exercise END,
      diet = CASE WHEN ${input.diet !== undefined} THEN EXCLUDED.diet ELSE profiles.diet END,
      hobbies = CASE WHEN ${input.hobbies !== undefined} THEN EXCLUDED.hobbies ELSE profiles.hobbies END,
      note = CASE WHEN ${input.note !== undefined} THEN EXCLUDED.note ELSE profiles.note END
    RETURNING *
  `;
  return profile!;
}
