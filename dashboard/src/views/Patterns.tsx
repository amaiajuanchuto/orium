import { useEffect, useState } from "react";
import { api, type Pattern } from "../lib/api";

const TYPE_LABELS: Record<Pattern["type"], string> = {
  sleep: "Sleep",
  day_of_week: "Day of week",
  tag: "Tag",
};

export function Patterns() {
  const [patterns, setPatterns] = useState<Pattern[] | null>(null);

  useEffect(() => {
    api
      .getPatterns()
      .then(setPatterns)
      .catch(() => setPatterns([]));
  }, []);

  return (
    <div>
      <h1 className="mb-1 font-heading text-2xl font-semibold text-ink">Patterns</h1>
      <p className="mb-6 text-sm text-muted">
        What tends to lift your mood — and what weighs on it.
      </p>

      {patterns === null && <p className="text-muted">Loading…</p>}

      {patterns !== null && patterns.length === 0 && (
        <p className="text-muted">
          Not enough data yet to surface patterns — keep logging and check back soon.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {patterns?.map((pattern, i) => {
          const positive = pattern.effect_size >= 0;
          return (
            <div key={i} className="rounded-2xl border border-border-1 bg-surface p-6">
              <div className="mb-3 flex items-center justify-between">
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  style={{ background: "var(--chip)", color: "var(--chip-ink)" }}
                >
                  {TYPE_LABELS[pattern.type]}
                </span>
                <span
                  className="font-heading text-lg font-bold"
                  style={{ color: positive ? "#7F9463" : "#C0523B" }}
                >
                  {positive ? "+" : ""}
                  {pattern.effect_size}
                </span>
              </div>
              <p className="mb-2 text-sm text-ink-soft">{pattern.summary}</p>
              <p className="text-sm text-label">{pattern.tip}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
