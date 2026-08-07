import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTheme } from "../lib/ThemeContext";
import { useAuth } from "../auth/AuthContext";
import { api, type StreakResult } from "../lib/api";

const NAV_ITEMS = [
  { to: "/today", label: "Today" },
  { to: "/calendar", label: "Calendar" },
  { to: "/trends", label: "Trends" },
  { to: "/patterns", label: "Patterns" },
  { to: "/journal", label: "Journal" },
  { to: "/profile", label: "Profile" },
];

export function Sidebar() {
  const { theme, setTheme } = useTheme();
  const { signOut } = useAuth();
  const [streak, setStreak] = useState<StreakResult | null>(null);

  useEffect(() => {
    api.getStreak().then(setStreak).catch(() => undefined);
  }, []);

  return (
    <aside className="flex h-screen w-[248px] shrink-0 flex-col border-r border-border-1 bg-surface px-5 py-6">
      <img
        src={theme === "dark" ? "/logo-dark.png" : "/logo.png"}
        alt="Orium"
        className="mb-6 h-8 w-auto object-contain object-left"
      />

      <div className="mb-6 flex rounded-full border border-border-3 bg-surface-2 p-1 text-sm">
        <button
          onClick={() => setTheme("light")}
          className="flex-1 rounded-full py-1 transition"
          style={{
            background: theme === "light" ? "var(--surface)" : "transparent",
            color: theme === "light" ? "var(--ink)" : "var(--muted)",
          }}
        >
          Light
        </button>
        <button
          onClick={() => setTheme("dark")}
          className="flex-1 rounded-full py-1 transition"
          style={{
            background: theme === "dark" ? "var(--surface)" : "transparent",
            color: theme === "dark" ? "var(--ink)" : "var(--muted)",
          }}
        >
          Dark
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive ? "bg-nav-active text-ink" : "text-nav-ink hover:bg-nav-active/60"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {streak && (
        <div className="mb-3 rounded-xl border border-border-1 bg-surface-2 p-4">
          <div className="font-heading text-2xl font-bold text-ink">
            {streak.current_streak}{" "}
            <span className="text-sm font-normal text-muted">day streak</span>
          </div>
          <p className="mt-1 text-xs text-faint">
            Nice rhythm — your longest is {streak.longest_streak} days.
          </p>
        </div>
      )}

      <button
        onClick={() => void signOut()}
        className="text-left text-xs text-muted hover:text-ink"
      >
        Log out
      </button>
    </aside>
  );
}
