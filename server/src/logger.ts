/**
 * Minimal structured logger — emits one JSON line per call to stdout/stderr,
 * so Render's log capture (or any future log drain/Sentry-style tool) can
 * filter and query by level and fields instead of grepping free-text
 * strings pasted together with `console.error`.
 */
type Level = "info" | "warn" | "error";

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function write(level: Level, message: string, fields?: Record<string, unknown>): void {
  const line = JSON.stringify(
    { level, message, time: new Date().toISOString(), ...fields },
    replacer,
  );
  if (level === "error") console.error(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, fields?: Record<string, unknown>) =>
    write("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) =>
    write("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) =>
    write("error", message, fields),
};
