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
