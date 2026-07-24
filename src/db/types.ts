export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface Entry {
  id: number;
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
