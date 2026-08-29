import { supabase } from "./supabase";

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

export interface CreateEntryInput {
  date: string;
  mood_rating: number;
  energy_level: number;
  sleep_hours?: number;
  notes?: string;
  tags?: string[];
}

export type UpdateEntryInput = Partial<CreateEntryInput>;

export interface ListEntriesFilters {
  from?: string;
  to?: string;
  tag?: string;
  min_mood_rating?: number;
  max_mood_rating?: number;
  min_energy_level?: number;
  max_energy_level?: number;
  limit?: number;
}

export interface StreakResult {
  current_streak: number;
  longest_streak: number;
  logged_today: boolean;
  next_milestone: number | null;
  days_until_next_milestone: number | null;
  message: string;
}

type Direction = "up" | "down" | "stable";

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

export interface Pattern {
  type: "sleep" | "day_of_week" | "tag";
  summary: string;
  effect_size: number;
  tip: string;
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

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? ""}`,
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function buildQuery<T extends object>(params: T): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const api = {
  listEntries: (filters: ListEntriesFilters = {}) =>
    request<EntryWithTags[]>(`/entries${buildQuery(filters)}`),

  getEntry: (id: number) => request<EntryWithTags>(`/entries/${id}`),

  createEntry: (input: CreateEntryInput) =>
    request<Entry>("/entries", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateEntry: (id: number, input: UpdateEntryInput) =>
    request<EntryWithTags>(`/entries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  deleteEntry: (id: number) => request<Entry>(`/entries/${id}`, { method: "DELETE" }),

  getToday: () => request<EntryWithTags | null>("/today"),

  search: (keyword: string) =>
    request<EntryWithTags[]>(`/search${buildQuery({ keyword })}`),

  getStreak: () => request<StreakResult | null>("/streak"),

  getSummary: (period: "week" | "month") =>
    request<SummaryResult | null>(`/summary${buildQuery({ period })}`),

  getMoodTrends: (period: "week" | "month" | "quarter") =>
    request<MoodTrendsResult | null>(`/mood-trends${buildQuery({ period })}`),

  getPatterns: () => request<Pattern[]>("/patterns"),

  getTags: () => request<string[]>("/tags"),

  getProfile: () => request<Profile | null>("/profile"),

  upsertProfile: (input: UpsertProfileInput) =>
    request<Profile>("/profile", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
};

export { ApiError };
