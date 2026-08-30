import { useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { ErrorBanner } from "./ErrorBanner";

/**
 * Account-lifecycle actions: export everything, or delete the account
 * outright. Deletion requires typing the account's own email to confirm —
 * there is no undo, so a plain click isn't enough friction for this.
 */
export function DangerZone() {
  const { session, signOut } = useAuth();
  const email = session?.user.email ?? "";
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(): Promise<void> {
    setError(null);
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orium-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Couldn't export your data — please try again.");
    }
  }

  async function handleDelete(): Promise<void> {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteAccount();
      await signOut();
    } catch (err) {
      setDeleting(false);
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't delete your account — please try again.",
      );
    }
  }

  const canDelete =
    email !== "" && confirmText.trim().toLowerCase() === email.toLowerCase();

  return (
    <div
      className="mb-6 rounded-2xl border p-6"
      style={{ borderColor: "var(--danger-border)" }}
    >
      <p
        className="mb-1 font-heading font-semibold"
        style={{ color: "var(--danger-ink)" }}
      >
        Danger zone
      </p>
      <p className="mb-4 text-sm text-muted">These actions are permanent.</p>

      {error && <ErrorBanner message={error} />}

      <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-border-1 bg-surface-2 p-4">
        <div>
          <p className="text-sm font-medium text-ink">Export your data</p>
          <p className="text-xs text-muted">
            Download every entry and your profile as a JSON file.
          </p>
        </div>
        <button
          onClick={() => void handleExport()}
          className="shrink-0 rounded-lg border border-border-3 bg-surface px-4 py-2 text-sm font-medium text-ink-soft hover:bg-surface-2"
        >
          Export
        </button>
      </div>

      <div
        className="rounded-lg border p-4"
        style={{ borderColor: "var(--danger-border)" }}
      >
        <p className="text-sm font-medium text-ink">Delete your account</p>
        <p className="mb-3 text-xs text-muted">
          Permanently deletes your account and every entry, tag link, and profile field
          tied to it. This can't be undone.
        </p>
        <label className="mb-1 block text-xs text-muted">
          Type your email ({email}) to confirm
        </label>
        <div className="flex gap-2">
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={email}
            className="w-full rounded-lg border border-border-2 bg-field px-3 py-1.5 text-sm text-ink outline-none focus:border-accent"
          />
          <button
            disabled={!canDelete || deleting}
            onClick={() => void handleDelete()}
            className="shrink-0 rounded-lg px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            style={{ background: "var(--danger-ink)" }}
          >
            {deleting ? "Deleting…" : "Delete account"}
          </button>
        </div>
      </div>
    </div>
  );
}
