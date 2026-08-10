import { useEffect, useState } from "react";
import { api, type EntryWithTags } from "../lib/api";
import { colorForMood } from "../lib/mood";
import { LoadingScreen } from "../components/LoadingScreen";
import { EntryForm } from "../components/EntryForm";
import {
  addMonths,
  daysInMonth,
  formatISOFromParts,
  MONTH_NAMES,
  startOfMonth,
  toISODate,
  WEEKDAY_LABELS,
  WEEKDAY_NAMES,
} from "../lib/date";

export function Calendar() {
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [entries, setEntries] = useState<Record<string, EntryWithTags>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth() + 1;
  const today = toISODate(new Date());

  useEffect(() => {
    setSelectedDate(null);
    setEditing(false);
    setLoading(true);
    const from = formatISOFromParts(year, month, 1);
    const to = formatISOFromParts(year, month, daysInMonth(monthDate));

    api
      .listEntries({ from, to, limit: 31 })
      .then((list) => {
        const byDate: Record<string, EntryWithTags> = {};
        for (const entry of list) byDate[entry.date] = entry;
        setEntries(byDate);
      })
      .catch(() => setEntries({}))
      .finally(() => setLoading(false));
  }, [year, month, monthDate]);

  const firstDow = new Date(year, month - 1, 1).getDay();
  const totalDays = daysInMonth(monthDate);
  const cells: Array<{ day: number; date: string } | null> = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => ({
      day: i + 1,
      date: formatISOFromParts(year, month, i + 1),
    })),
  ];

  const selected = selectedDate ? entries[selectedDate] : undefined;

  if (loading) return <LoadingScreen />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold text-ink">
          {MONTH_NAMES[month - 1]} {year}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setMonthDate((d) => addMonths(d, -1))}
            className="rounded-lg border border-border-3 bg-surface px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-2"
          >
            ← Prev
          </button>
          <button
            onClick={() => setMonthDate((d) => addMonths(d, 1))}
            className="rounded-lg border border-border-3 bg-surface px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-2"
          >
            Next →
          </button>
        </div>
      </div>

      <div
        className={`grid grid-cols-1 gap-6 ${selectedDate ? "lg:grid-cols-[1.7fr_1fr]" : ""}`}
      >
        <div className="rounded-2xl border border-border-1 bg-surface p-5">
          <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs font-medium text-muted">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {cells.map((cell, i) => {
              if (!cell) return <div key={`empty-${i}`} />;

              const future = cell.date > today;
              const entry = entries[cell.date];
              const sel = cell.date === selectedDate;

              return (
                <button
                  key={cell.date}
                  disabled={future}
                  onClick={() => {
                    setSelectedDate(cell.date);
                    setEditing(false);
                  }}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border text-sm transition"
                  style={{
                    borderColor: sel ? "var(--accent)" : "var(--border-1)",
                    borderWidth: sel ? 2 : 1,
                    background: future
                      ? "transparent"
                      : entry
                        ? "var(--field)"
                        : "var(--surface-2)",
                    color: future ? "var(--faint)" : "var(--ink-soft)",
                    cursor: future ? "default" : "pointer",
                  }}
                >
                  <span>{cell.day}</span>
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      background: future
                        ? "transparent"
                        : colorForMood(entry?.mood_rating),
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {selectedDate && (
          <div className="rounded-2xl border border-border-1 bg-surface p-6">
            <p className="text-xs text-muted">
              {WEEKDAY_NAMES[new Date(`${selectedDate}T00:00:00Z`).getUTCDay()]}
            </p>
            <p className="mb-4 font-heading text-lg font-semibold text-ink">
              {MONTH_NAMES[month - 1]} {Number(selectedDate.slice(8, 10))}
            </p>

            {editing || !selected ? (
              <EntryForm
                date={selectedDate}
                existing={selected}
                onSaved={(entry) => {
                  setEntries((current) => ({ ...current, [entry.date]: entry }));
                  setEditing(false);
                }}
                onCancel={selected ? () => setEditing(false) : undefined}
              />
            ) : (
              <>
                <div
                  className="mb-4 flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white"
                  style={{ background: colorForMood(selected.mood_rating) }}
                >
                  {selected.mood_rating}
                </div>

                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border-1 bg-surface-2 p-3">
                    <p className="text-xs text-muted">Energy</p>
                    <p className="font-heading text-lg font-semibold text-ink">
                      {selected.energy_level}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border-1 bg-surface-2 p-3">
                    <p className="text-xs text-muted">Sleep</p>
                    <p className="font-heading text-lg font-semibold text-ink">
                      {selected.sleep_hours != null ? `${selected.sleep_hours}h` : "–"}
                    </p>
                  </div>
                </div>

                {selected.notes && (
                  <p className="mb-4 text-sm text-ink-soft">{selected.notes}</p>
                )}

                {selected.tags.length > 0 && (
                  <div className="mb-5 flex flex-wrap gap-1.5">
                    {selected.tags.map((tag) => (
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

                <button
                  onClick={() => setEditing(true)}
                  className="rounded-lg border border-border-3 bg-surface px-4 py-2 text-sm font-medium text-ink-soft hover:bg-surface-2"
                >
                  Edit entry
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
