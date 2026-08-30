import { useEffect, useState } from "react";
import { api, type Pattern } from "../lib/api";
import { LoadingScreen } from "../components/LoadingScreen";
import { ErrorBanner } from "../components/ErrorBanner";

const TYPE_LABELS: Record<Pattern["type"], string> = {
  sleep: "Sleep",
  day_of_week: "Day of week",
  tag: "Tag",
};

function formatPValue(p: number): string {
  return p < 0.001 ? "p < 0.001" : `p = ${p}`;
}

export function Patterns() {
  const [patterns, setPatterns] = useState<Pattern[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    setLoadError(false);
    api
      .getPatterns()
      .then(setPatterns)
      .catch(() => {
        setPatterns([]);
        setLoadError(true);
      });
  }, [reloadToken]);

  if (patterns === null) return <LoadingScreen />;

  return (
    <div>
      <h1 className="mb-1 font-heading text-2xl font-semibold text-ink">Patterns</h1>
      <p className="mb-6 text-sm text-muted">
        What tends to lift your mood — and what weighs on it.
      </p>

      {loadError && (
        <ErrorBanner
          message="Couldn't load your patterns."
          onRetry={() => setReloadToken((n) => n + 1)}
        />
      )}

      {!loadError && patterns.length === 0 && (
        <p className="text-muted">
          Not enough data yet to surface patterns — keep logging and check back soon.
        </p>
      )}

      {patterns.length > 0 && (
        <p className="mb-4 text-xs text-faint">
          Each pattern shown has passed a statistical significance test (Welch's t-test, p
          &lt; 0.05) — the difference is unlikely to be random noise, though it's still an
          association, not proof of cause and effect.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {patterns.map((pattern, i) => {
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
              <p className="mb-2 text-sm text-label">{pattern.tip}</p>
              <p className="text-xs text-faint">
                ✓ Statistically significant ({formatPValue(pattern.p_value)})
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
