import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { PasswordInput } from "../components/PasswordInput";

const FEATURES = [
  "Journal your mood, energy, and sleep in seconds — from chat or the web.",
  "See trends, streaks, and patterns emerge over time, not just single entries.",
  "Your data, private by default — every account's journal is fully isolated.",
];

type Mode = "login" | "signup" | "reset";

export function Login() {
  const { signIn, signUp, sendPasswordReset } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  function switchMode(next: Mode): void {
    setMode(next);
    setError(null);
    setCheckEmail(false);
    setResetSent(false);
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);

    if (mode === "signup") {
      if (password !== confirmPassword) {
        setError("Passwords don't match.");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
    }

    setSubmitting(true);
    if (mode === "login") {
      const message = await signIn(email, password);
      if (message) setError(message);
    } else if (mode === "signup") {
      const { error: message, confirmationRequired } = await signUp(email, password);
      if (message) setError(message);
      else if (confirmationRequired) setCheckEmail(true);
    } else {
      const message = await sendPasswordReset(email);
      if (message) setError(message);
      else setResetSent(true);
    }
    setSubmitting(false);
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <div
        className="hidden w-1/2 flex-col justify-center gap-8 px-16 py-12 lg:flex"
        style={{
          background: "linear-gradient(135deg, var(--accent), var(--accent-dark))",
        }}
      >
        <img src="/logo-dark.png" alt="Orium" className="h-16 w-auto object-contain" />

        <div>
          <h1 className="mb-3 font-heading text-3xl font-bold text-on-accent">
            A calmer way to track how you're doing.
          </h1>
          <p className="max-w-md text-on-accent opacity-90">
            Orium is a mental-health journal you can log to just by talking to Claude,
            then explore here — mood, energy, sleep, and the patterns underneath them.
          </p>
        </div>

        <ul className="flex flex-col gap-4">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-start gap-3 text-on-accent">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-on-accent opacity-80" />
              <span className="text-sm opacity-90">{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border-1 bg-surface p-8 shadow-sm">
          <img
            src="/logo.png"
            alt="Orium"
            className="mb-6 h-8 w-auto object-contain lg:hidden"
          />

          {checkEmail ? (
            <>
              <h1 className="mb-1 font-heading text-2xl font-semibold text-ink">
                Check your email
              </h1>
              <p className="mb-6 text-sm text-muted">
                We sent a confirmation link to <strong>{email}</strong>. Click it to
                activate your account, then log in below.
              </p>
              <button
                onClick={() => switchMode("login")}
                className="w-full rounded-lg border border-border-3 bg-surface px-4 py-2 text-sm font-medium text-ink-soft hover:bg-surface-2"
              >
                Back to log in
              </button>
            </>
          ) : resetSent ? (
            <>
              <h1 className="mb-1 font-heading text-2xl font-semibold text-ink">
                Check your email
              </h1>
              <p className="mb-6 text-sm text-muted">
                We sent a password reset link to <strong>{email}</strong>. Click it to set
                a new password.
              </p>
              <button
                onClick={() => switchMode("login")}
                className="w-full rounded-lg border border-border-3 bg-surface px-4 py-2 text-sm font-medium text-ink-soft hover:bg-surface-2"
              >
                Back to log in
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <h1 className="mb-1 font-heading text-2xl font-semibold text-ink">
                {mode === "login"
                  ? "Welcome back"
                  : mode === "signup"
                    ? "Create your account"
                    : "Reset your password"}
              </h1>
              <p className="mb-6 text-sm text-muted">
                {mode === "login"
                  ? "Log in to your journal."
                  : mode === "signup"
                    ? "Start journaling in a couple of minutes."
                    : "We'll email you a link to set a new password."}
              </p>

              <label className="mb-1 block text-sm text-ink-soft" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mb-4 w-full rounded-lg border border-border-2 bg-field px-3 py-2 text-ink outline-none focus:border-accent"
              />

              {mode !== "reset" && (
                <>
                  <label className="mb-1 block text-sm text-ink-soft" htmlFor="password">
                    Password
                  </label>
                  <div className={mode === "login" ? "mb-1" : "mb-4"}>
                    <PasswordInput
                      id="password"
                      name="password"
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      value={password}
                      onChange={setPassword}
                    />
                  </div>
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => switchMode("reset")}
                      className="mb-4 block text-xs text-muted underline hover:text-ink"
                    >
                      Forgot password?
                    </button>
                  )}
                </>
              )}

              {mode === "signup" && (
                <>
                  <label
                    className="mb-1 block text-sm text-ink-soft"
                    htmlFor="confirmPassword"
                  >
                    Confirm password
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
                </>
              )}

              {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-accent px-4 py-2 font-semibold text-on-accent transition hover:bg-accent-dark disabled:opacity-60"
              >
                {submitting
                  ? mode === "login"
                    ? "Logging in…"
                    : mode === "signup"
                      ? "Creating account…"
                      : "Sending link…"
                  : mode === "login"
                    ? "Log in"
                    : mode === "signup"
                      ? "Sign up"
                      : "Send reset link"}
              </button>

              <p className="mt-4 text-center text-sm text-muted">
                {mode === "login" ? (
                  <>
                    Don't have an account?{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("signup")}
                      className="font-medium text-ink-soft underline hover:text-ink"
                    >
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    {mode === "reset" ? "Remembered it?" : "Already have an account?"}{" "}
                    <button
                      type="button"
                      onClick={() => switchMode("login")}
                      className="font-medium text-ink-soft underline hover:text-ink"
                    >
                      Log in
                    </button>
                  </>
                )}
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
