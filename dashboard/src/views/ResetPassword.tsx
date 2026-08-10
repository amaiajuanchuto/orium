import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { PasswordInput } from "../components/PasswordInput";

export function ResetPassword() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setSubmitting(true);
    const message = await updatePassword(password);
    if (message) setError(message);
    setSubmitting(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-border-1 bg-surface p-8 shadow-sm"
      >
        <img src="/logo.png" alt="Orium" className="mb-6 h-8 w-auto object-contain" />
        <h1 className="mb-1 font-heading text-2xl font-semibold text-ink">
          Set a new password
        </h1>
        <p className="mb-6 text-sm text-muted">Choose a new password for your account.</p>

        <label className="mb-1 block text-sm text-ink-soft" htmlFor="password">
          New password
        </label>
        <div className="mb-4">
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
          />
        </div>

        <label className="mb-1 block text-sm text-ink-soft" htmlFor="confirmPassword">
          Confirm new password
        </label>
        <div className="mb-4">
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
          />
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-accent px-4 py-2 font-semibold text-on-accent transition hover:bg-accent-dark disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Save new password"}
        </button>
      </form>
    </div>
  );
}
