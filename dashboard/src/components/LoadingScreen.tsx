import { useTheme } from "../lib/ThemeContext";

/** Centered spinning-logo loading state, used while a view's data is in flight. */
export function LoadingScreen() {
  const { theme } = useTheme();

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5">
      <img
        src={theme === "dark" ? "/logo-mark-dark.png" : "/logo-mark.png"}
        alt="Loading"
        className="h-24 w-24 animate-spin object-contain"
      />
      <p className="text-base text-muted">Loading…</p>
    </div>
  );
}
