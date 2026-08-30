import { useEffect, useState } from "react";
import { api, type EntryWithTags, type Pattern, type SummaryResult } from "../lib/api";
import { colorForMood } from "../lib/mood";
import { addDays, toISODate } from "../lib/date";
import { useStreak } from "../lib/StreakContext";
import { LoadingScreen } from "../components/LoadingScreen";
import { EntryForm } from "../components/EntryForm";
import { EditDeleteButtons } from "../components/EditDeleteButtons";

export function Today() {
  const { refreshStreak } = useStreak();
  const [existing, setExisting] = useState<EntryWithTags | null>(null);
  const [editing, setEditing] = useState(false);

  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [pattern, setPattern] = useState<Pattern | null>(null);
  const [sparkline, setSparkline] = useState<
    { date: string; entry: EntryWithTags | null }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const today = toISODate(new Date());

  function loadSparkline(): Promise<void> {
    const now = new Date();
    const from = toISODate(addDays(now, -6));
    const to = toISODate(now);

    return api
      .listEntries({ from, to, limit: 7 })
      .then((entries) => {
        const byDate = new Map(entries.map((entry) => [entry.date, entry]));
        const slots = Array.from({ length: 7 }, (_, i) => {
          const date = toISODate(addDays(now, -6 + i));
          return { date, entry: byDate.get(date) ?? null };
        });
        setSparkline(slots);
      })
      .catch(() => undefined);
  }

  useEffect(() => {
    Promise.all([
      api.getToday(today).then(setExisting),
      api
        .getSummary("week")
        .then(setSummary)
        .catch(() => undefined),
      api
        .getPatterns()
        .then((patterns) => setPattern(patterns[0] ?? null))
        .catch(() => undefined),
      loadSparkline(),
    ]).finally(() => setLoading(false));
  }, []);

  function handleSaved(entry: EntryWithTags): void {
    setExisting(entry);
    setEditing(false);
    refreshStreak();
    void loadSparkline();
    api
      .getSummary("week")
      .then(setSummary)
      .catch(() => undefined);
  }

  async function handleDelete(): Promise<void> {
    if (!existing) return;
    await api.deleteEntry(existing.id);
    setExisting(null);
    setEditing(false);
    refreshStreak();
    void loadSparkline();
    api
      .getSummary("week")
      .then(setSummary)
      .catch(() => undefined);
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

        {existing && !editing ? (
          <div>
            <div className="mb-5 flex items-center gap-4">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white"
                style={{ background: colorForMood(existing.mood_rating) }}
              >
                {existing.mood_rating}
              </div>
              <div>
                <p className="font-heading font-semibold text-ink">
                  Today's entry is logged ✓
                </p>
                <p className="text-sm text-muted">
                  Energy {existing.energy_level}
                  {existing.sleep_hours != null && ` · Sleep ${existing.sleep_hours}h`}
                </p>
              </div>
            </div>

            {existing.notes && (
              <p className="mb-4 text-sm text-ink-soft">{existing.notes}</p>
            )}

            {existing.tags.length > 0 && (
              <div className="mb-5 flex flex-wrap gap-1.5">
                {existing.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full px-2.5 py-0.5 text-xs"
                    style={{ background: "var(--chip)", color: "var(--chip-ink)" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <EditDeleteButtons
                onEdit={() => setEditing(true)}
                onDelete={handleDelete}
              />
            </div>
          </div>
        ) : (
          <EntryForm date={today} existing={existing} onSaved={handleSaved} />
        )}
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
