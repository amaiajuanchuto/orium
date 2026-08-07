import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type EntryWithTags, type MoodTrendsResult } from "../lib/api";
import { addDays, toISODate } from "../lib/date";

type Period = "week" | "month" | "quarter";

const PERIODS: { id: Period; label: string; days: number }[] = [
  { id: "week", label: "Week", days: 7 },
  { id: "month", label: "Month", days: 30 },
  { id: "quarter", label: "Quarter", days: 90 },
];

const DIRECTION_ARROW: Record<string, string> = {
  up: "▲",
  down: "▼",
  stable: "►",
};

function StatCard({
  label,
  current,
  previous,
  direction,
  suffix = "",
}: {
  label: string;
  current: number | null;
  previous: number | null;
  direction: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl border border-border-1 bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold text-ink">
        {current != null ? `${current}${suffix}` : "–"}
      </p>
      <p className="mt-1 text-xs text-muted">
        {DIRECTION_ARROW[direction] ?? "►"} {direction}
        {previous != null && ` from ${previous}${suffix} prior period`}
      </p>
    </div>
  );
}

export function Trends() {
  const [period, setPeriod] = useState<Period>("week");
  const [entries, setEntries] = useState<EntryWithTags[]>([]);
  const [trends, setTrends] = useState<MoodTrendsResult | null>(null);

  useEffect(() => {
    const days = PERIODS.find((p) => p.id === period)!.days;
    const today = new Date();
    const from = toISODate(addDays(today, -(days - 1)));
    const to = toISODate(today);

    api
      .listEntries({ from, to, limit: 100 })
      .then((list) => setEntries([...list].reverse()))
      .catch(() => setEntries([]));

    api
      .getMoodTrends(period)
      .then(setTrends)
      .catch(() => setTrends(null));
  }, [period]);

  const chartData = entries.map((e) => ({
    date: e.date.slice(5),
    mood: e.mood_rating,
    energy: e.energy_level,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold text-ink">Trends</h1>
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className="rounded-full border px-3 py-1.5 text-sm transition"
              style={{
                background: period === p.id ? "var(--accent)" : "var(--surface)",
                color: period === p.id ? "var(--on-accent)" : "var(--muted)",
                borderColor: period === p.id ? "var(--accent)" : "var(--border-3)",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-border-1 bg-surface p-5">
        {chartData.length === 0 ? (
          <p className="py-12 text-center text-muted">
            No entries logged in this period yet.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid stroke="var(--border-1)" />
              <XAxis
                dataKey="date"
                stroke="var(--faint)"
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                domain={[1, 10]}
                stroke="var(--faint)"
                fontSize={11}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border-2)",
                  borderRadius: 8,
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="mood"
                name="Mood"
                stroke="var(--accent)"
                strokeWidth={3}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="energy"
                name="Energy"
                stroke="#D9A441"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {trends && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Avg mood"
            current={trends.current_period.mood_rating}
            previous={trends.previous_period.mood_rating}
            direction={trends.mood_direction}
          />
          <StatCard
            label="Avg energy"
            current={trends.current_period.energy_level}
            previous={trends.previous_period.energy_level}
            direction={trends.energy_direction}
          />
          <StatCard
            label="Avg sleep"
            current={trends.current_period.sleep_hours}
            previous={trends.previous_period.sleep_hours}
            direction="stable"
            suffix="h"
          />
        </div>
      )}
    </div>
  );
}
