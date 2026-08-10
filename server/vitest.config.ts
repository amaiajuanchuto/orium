import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // All test files share one local Postgres instance (see supabase/), and
    // each truncates its tables between tests — running files in parallel
    // would let one file's TRUNCATE race another file's in-flight test.
    fileParallelism: false,
  },
});
