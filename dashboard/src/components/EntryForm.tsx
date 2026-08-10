import { useState } from "react";
import { api, type EntryWithTags } from "../lib/api";
import { colorForMood } from "../lib/mood";

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

interface EntryFormProps {
  /** The date this entry is for (YYYY-MM-DD). */
  date: string;
  /** The existing entry for this date, if editing one; omit/null to create. */
  existing?: EntryWithTags | null;
  /** Called with the saved entry once the save succeeds. */
  onSaved: (entry: EntryWithTags) => void;
  /** Called when the user cancels out of the form without saving. */
  onCancel?: () => void;
}

export function EntryForm({ date, existing, onSaved, onCancel }: EntryFormProps) {
  const [mood, setMood] = useState<number | null>(existing?.mood_rating ?? null);
  const [energy, setEnergy] = useState<number | null>(existing?.energy_level ?? null);
  const [sleep, setSleep] = useState(
    existing?.sleep_hours != null ? String(existing.sleep_hours) : "",
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = mood !== null && energy !== null;

  function toggleTag(tag: string): void {
    setTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    );
  }

  async function handleSave(): Promise<void> {
    if (mood === null || energy === null) return;

    setSaving(true);
    setError(null);
    const input = {
      date,
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
      onSaved(saved);
    } catch {
      setError("Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
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
        {DOTS.map((d) => {
          const filled = energy !== null && d <= energy;
          return (
            <button
              key={d}
              onClick={() => setEnergy(d)}
              className="h-6 flex-1 rounded-md border transition"
              style={{
                background: filled ? colorForMood(energy) : "var(--field)",
                borderColor: filled ? colorForMood(energy) : "var(--border-2)",
              }}
            />
          );
        })}
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

      <div className="flex items-center gap-3">
        <button
          onClick={() => void handleSave()}
          disabled={saving || !canSave}
          className="rounded-lg bg-accent px-5 py-2 font-semibold text-on-accent transition hover:bg-accent-dark disabled:opacity-60"
        >
          {saving ? "Saving…" : existing ? "Update entry" : "Save entry"}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="rounded-lg border border-border-3 bg-surface px-4 py-2 text-sm font-medium text-ink-soft hover:bg-surface-2"
          >
            Cancel
          </button>
        )}
        {!canSave && !error && (
          <span className="text-sm text-muted">Pick a mood and energy first.</span>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
