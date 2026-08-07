import { useEffect, useState } from "react";
import { api, type EntryWithTags } from "../lib/api";
import { colorForMood } from "../lib/mood";

export function Journal() {
  const [entries, setEntries] = useState<EntryWithTags[]>([]);
  const [keyword, setKeyword] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const request = submittedKeyword
      ? api.search(submittedKeyword)
      : api.listEntries({ limit: 50 });

    request
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [submittedKeyword]);

  return (
    <div>
      <h1 className="mb-1 font-heading text-2xl font-semibold text-ink">
        Journal
      </h1>
      <p className="mb-6 text-sm text-muted">All your past entries.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmittedKeyword(keyword.trim());
        }}
        className="mb-6 flex gap-2"
      >
        <input
          type="search"
          placeholder="Search notes…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-border-2 bg-field px-3 py-2 text-ink outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="rounded-lg border border-border-3 bg-surface px-4 py-2 text-sm font-medium text-ink-soft hover:bg-surface-2"
        >
          Search
        </button>
      </form>

      {loading && <p className="text-muted">Loading…</p>}

      {!loading && entries.length === 0 && (
        <p className="text-muted">No entries found.</p>
      )}

      <div className="flex flex-col gap-3">
        {entries.map((entry) => (
          <article
            key={entry.id}
            className="rounded-2xl border border-border-1 bg-surface p-5"
          >
            <div className="flex items-start gap-4">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                style={{ background: colorForMood(entry.mood_rating) }}
              >
                {entry.mood_rating}
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-heading font-semibold text-ink">
                    {new Date(entry.date + "T00:00:00").toLocaleDateString(
                      undefined,
                      { month: "long", day: "numeric", year: "numeric" },
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    Energy {entry.energy_level}
                    {entry.sleep_hours != null &&
                      ` · Sleep ${entry.sleep_hours}h`}
                  </p>
                </div>
                {entry.notes && (
                  <p className="mt-2 text-sm text-ink-soft">{entry.notes}</p>
                )}
                {entry.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {entry.tags.map((tag) => (
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
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
