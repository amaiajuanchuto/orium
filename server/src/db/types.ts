/**
 * Shared types and date-format constant for a journal entry row and its
 * tag-annotated variant.
 */
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface Entry {
  id: number;
  user_id: string;
  date: string;
  mood_rating: number;
  energy_level: number;
  sleep_hours: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntryWithTags extends Entry {
  tags: string[];
}

export interface Profile {
  user_id: string;
  name: string | null;
  age: string | null;
  pronouns: string | null;
  work: string | null;
  work_rhythm: string | null;
  exercise: string[];
  diet: string | null;
  hobbies: string[];
  note: string | null;
  created_at: string;
  updated_at: string;
}
