import { useEffect, useState } from "react";
import { api, type EntryWithTags, type Pattern, type SummaryResult } from "../lib/api";
import { colorForMood } from "../lib/mood";
import { addDays, toISODate } from "../lib/date";
import { useStreak } from "../lib/StreakContext";
import { LoadingScreen } from "../components/LoadingScreen";

const QUICK_TAGS = [
  "exercise",
  "work",
  "social",
  "coffee",
  "reading",
  "outdoors",
  "anxious",
  "calm",
];

const DOTS = Array.from({ length: 10 }, (_, i) => i + 1);

export function Today() {
  const { refreshStreak } = useStreak();
  const [existing, setExisting] = useState<EntryWithTags | null>(null);
  const [mood, setMood] = useState(7);
  const [energy, setEnergy] = useState(7);
  const [sleep, setSleep] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [pattern, setPattern] = useState<Pattern | null>(null);
  const [sparkline, setSparkline] = useState<
    { date: string; entry: EntryWithTags | null }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date();
    const from = toISODate(addDays(today, -6));
    const to = toISODate(today);

    Promise.all([
      api.getToday().then((entry) => {
        if (entry) {
          setExisting(entry);
          setMood(entry.mood_rating);
          setEnergy(entry.energy_level);
          setSleep(entry.sleep_hours != null ? String(entry.sleep_hours) : "");
          setNotes(entry.notes ?? "");
          setTags(entry.tags);
        }
      }),
      api
        .getSummary("week")
        .then(setSummary)
        .catch(() => undefined),
      api
        .getPatterns()
        .then((patterns) => setPattern(patterns[0] ?? null))
        .catch(() => undefined),
      api
        .listEntries({ from, to, limit: 7 })
        .then((entries) => {
          const byDate = new Map(entries.map((entry) => [entry.date, entry]));
          const slots = Array.from({ length: 7 }, (_, i) => {
            const date = toISODate(addDays(today, -6 + i));
            return { date, entry: byDate.get(date) ?? null };
          });
          setSparkline(slots);
        })
        .catch(() => undefined),
    ]).finally(() => setLoading(false));
  }, []);

  function toggleTag(tag: string): void {
    setTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    );
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setSaveError(null);
    const input = {
      date: new Date().toISOString().slice(0, 10),
      mood_rating: mood,
      energy_level: energy,
      sleep_hours: sleep ? Number(sleep) : undefined,
      notes: notes || undefined,
      tags,
    };

    try {
      const saved = existing
        ? await api.updateEntry(existing.id, input)
        : await api.getEntry((await api.createEntry(input)).id);

      setExisting(saved);
      refreshStreak();
      setSavedAt(Date.now());
    } catch {
      setSaveError("Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingScreen />;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.35fr_.95fr]">
      <section className="rounded-2xl border border-border-1 bg-surface p-7">
        <h1 className="mb-1 font-heading text-2xl font-semibold text-ink">
          How's today?
        </h1>
        <p className="mb-6 text-sm text-muted">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>

        <label className="mb-2 block text-sm font-medium text-ink-soft">Mood</label>
        <div className="mb-5 flex gap-2">
          {DOTS.map((d) => (
            <button
              key={d}
              onClick={() => setMood(d)}
              className="flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition"
              style={{
                background: d === mood ? colorForMood(d) : "var(--field)",
                borderColor: d === mood ? colorForMood(d) : "var(--border-2)",
                color: d === mood ? "#fff" : "var(--muted)",
                transform: d === mood ? "scale(1.15)" : undefined,
              }}
            >
              {d}
            </button>
          ))}
        </div>

        <label className="mb-2 block text-sm font-medium text-ink-soft">Energy</label>
        <div className="mb-5 flex gap-1.5">
          {DOTS.map((d) => (
            <button
              key={d}
              onClick={() => setEnergy(d)}
              className="h-6 flex-1 rounded-md border transition"
              style={{
                background: d <= energy ? "var(--accent)" : "var(--field)",
                borderColor: d <= energy ? "var(--accent)" : "var(--border-2)",
              }}
            />
          ))}
        </div>

        <label className="mb-2 block text-sm font-medium text-ink-soft">
          Sleep (hours)
        </label>
        <input
          type="number"
          step="0.5"
          min="0"
          max="24"
          value={sleep}
          onChange={(e) => setSleep(e.target.value)}
          className="mb-5 w-32 rounded-lg border border-border-2 bg-field px-3 py-2 text-ink outline-none focus:border-accent"
        />

        <label className="mb-2 block text-sm font-medium text-ink-soft">Tags</label>
        <div className="mb-5 flex flex-wrap gap-2">
          {QUICK_TAGS.map((tag) => {
            const active = tags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className="rounded-full border px-3 py-1 text-sm transition"
                style={{
                  background: active ? "var(--accent)" : "var(--chip)",
                  borderColor: active ? "var(--accent)" : "var(--border-3)",
                  color: active ? "var(--on-accent)" : "var(--chip-ink)",
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>

        <label className="mb-2 block text-sm font-medium text-ink-soft">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="mb-6 w-full rounded-lg border border-border-2 bg-field px-3 py-2 text-ink outline-none focus:border-accent"
        />

        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-lg bg-accent px-5 py-2 font-semibold text-on-accent transition hover:bg-accent-dark disabled:opacity-60"
        >
          {saving ? "Saving…" : existing ? "Update entry" : "Save entry"}
        </button>
        {savedAt && !saveError && <span className="ml-3 text-sm text-muted">Saved.</span>}
        {saveError && <span className="ml-3 text-sm text-red-600">{saveError}</span>}
      </section>

      <aside className="flex flex-col gap-5">
        {summary && (
          <div
            className="rounded-2xl p-6 text-on-accent"
            style={{
              background: "linear-gradient(135deg, var(--accent), var(--accent-dark))",
            }}
          >
            <p className="text-xs uppercase tracking-wide opacity-80">This week</p>
            <p className="mt-1 font-heading text-4xl font-bold">
              {summary.averages.mood_rating ?? "–"}
            </p>
            <p className="mt-1 text-sm opacity-90">{summary.message}</p>
          </div>
        )}

        {pattern && (
          <div className="rounded-2xl border border-border-1 bg-surface-2 p-5">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-label">
              Gentle nudge
            </p>
            <p className="text-sm text-ink-soft">{pattern.summary}</p>
          </div>
        )}

        {sparkline.length > 0 && (
          <div className="rounded-2xl border border-border-1 bg-surface p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              Last 7 days
            </p>
            <div className="flex h-24 items-end gap-2">
              {sparkline.map(({ date, entry }) => (
                <div
                  key={date}
                  className="flex-1 rounded-t-md"
                  style={{
                    height: entry ? `${(entry.mood_rating / 10) * 100}%` : "6%",
                    background: colorForMood(entry?.mood_rating),
                  }}
                  title={
                    entry ? `${date}: mood ${entry.mood_rating}` : `${date}: no entry`
                  }
                />
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
