import { Link, NavLink } from "react-router-dom";
import { useTheme } from "../lib/ThemeContext";
import { useStreak } from "../lib/StreakContext";

const NAV_ITEMS = [
  { to: "/today", label: "Today" },
  { to: "/calendar", label: "Calendar" },
  { to: "/trends", label: "Trends" },
  { to: "/patterns", label: "Patterns" },
  { to: "/journal", label: "Journal" },
  { to: "/profile", label: "Profile" },
];

interface SidebarProps {
  /** Whether the mobile off-canvas drawer is open. Ignored at the `lg` breakpoint and up. */
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { theme } = useTheme();
  const { streak } = useStreak();

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-[248px] shrink-0 flex-col overflow-y-auto border-r border-border-1 bg-surface px-5 py-6 transition-transform duration-200 lg:sticky lg:top-0 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Link to="/today" onClick={onClose} className="mb-6 block w-fit">
          <img
            src={theme === "dark" ? "/logo-dark.png" : "/logo.png"}
            alt="Orium — go to Today"
            className="h-12 w-auto object-contain object-left"
          />
        </Link>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-nav-active text-ink"
                    : "text-nav-ink hover:bg-nav-active/60"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {streak && (
          <div className="mb-4 rounded-xl border border-border-1 bg-surface-2 p-4">
            <div className="font-heading text-2xl font-bold text-ink">
              {streak.current_streak}{" "}
              <span className="text-sm font-normal text-muted">day streak</span>
            </div>
            <p className="mt-1 text-xs text-faint">
              Nice rhythm — your longest is {streak.longest_streak} days.
            </p>
          </div>
        )}

        <a
          href="/privacy"
          target="_blank"
          rel="noreferrer"
          className="text-center text-xs text-faint underline"
        >
          Privacy policy
        </a>
      </aside>
    </>
  );
}
