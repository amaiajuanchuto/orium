import { useEffect, useRef, useState } from "react";
import { api, type EntryWithTags } from "../lib/api";
import { colorForMood } from "../lib/mood";
import { LoadingScreen } from "../components/LoadingScreen";
import { EntryForm } from "../components/EntryForm";
import { EditDeleteButtons } from "../components/EditDeleteButtons";
import { ErrorBanner } from "../components/ErrorBanner";
import { useStreak } from "../lib/StreakContext";

const PAGE_SIZE = 30;

export function Journal() {
  const { refreshStreak } = useStreak();
  const [entries, setEntries] = useState<EntryWithTags[]>([]);
  const [keyword, setKeyword] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Plain keyword search returns its full (capped) result set in one go —
  // only the unfiltered listing pages, since it's the one that can genuinely
  // run to hundreds of entries over time.
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    setHasMore(true);
    const request = submittedKeyword
      ? api.search(submittedKeyword)
      : api.listEntries({ limit: PAGE_SIZE });

    request
      .then((list) => {
        setEntries(list);
        if (!submittedKeyword) setHasMore(list.length === PAGE_SIZE);
      })
      .catch(() => {
        setEntries([]);
        setLoadError(true);
      })
      .finally(() => {
        setLoading(false);
        setInitialLoad(false);
      });
  }, [submittedKeyword, reloadToken]);

  useEffect(() => {
    if (submittedKeyword || loading || loadError || !hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setLoadingMore(true);
          api
            .listEntries({ limit: PAGE_SIZE, offset: entries.length })
            .then((more) => {
              setEntries((current) => [...current, ...more]);
              setHasMore(more.length === PAGE_SIZE);
            })
            .catch(() => setHasMore(false))
            .finally(() => setLoadingMore(false));
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [submittedKeyword, loading, loadError, hasMore, entries.length]);

  if (initialLoad) return <LoadingScreen />;

  return (
    <div>
      <h1 className="mb-1 font-heading text-2xl font-semibold text-ink">Journal</h1>
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
          placeholder="Search notes or tags…"
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

      {loadError && (
        <ErrorBanner
          message="Couldn't load your entries."
          onRetry={() => setReloadToken((n) => n + 1)}
        />
      )}

      {loading && <LoadingScreen />}

      {!loading && !loadError && entries.length === 0 && (
        <p className="text-muted">No entries found.</p>
      )}

      {!loading && (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => (
            <article
              key={entry.id}
              className="rounded-2xl border border-border-1 bg-surface p-5"
            >
              {editingId === entry.id ? (
                <EntryForm
                  date={entry.date}
                  existing={entry}
                  onSaved={(saved) => {
                    setEntries((current) =>
                      current.map((e) => (e.id === saved.id ? saved : e)),
                    );
                    setEditingId(null);
                    refreshStreak();
                  }}
                />
              ) : (
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
                        {entry.sleep_hours != null && ` · Sleep ${entry.sleep_hours}h`}
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
                            style={{
                              background: "var(--chip)",
                              color: "var(--chip-ink)",
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex justify-end">
                      <EditDeleteButtons
                        onEdit={() => setEditingId(entry.id)}
                        onDelete={async () => {
                          await api.deleteEntry(entry.id);
                          setEntries((current) =>
                            current.filter((e) => e.id !== entry.id),
                          );
                          refreshStreak();
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </article>
          ))}

          {!submittedKeyword && hasMore && (
            <div ref={sentinelRef} className="py-4 text-center">
              {loadingMore && <span className="text-sm text-muted">Loading more…</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
