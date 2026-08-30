/**
 * Inline error notice, distinct from an "empty" state — shown when a
 * load or save genuinely failed, not when there's simply no data yet.
 */
export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="mb-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
      style={{
        background: "var(--danger-bg)",
        borderColor: "var(--danger-border)",
        color: "var(--danger-ink)",
      }}
    >
      <span>{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 font-medium underline underline-offset-2"
        >
          Try again
        </button>
      )}
    </div>
  );
}
