import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // The integration suites spawn git and write worktrees; forks keep one
    // suite's chdir and process env out of another's.
    pool: "forks",
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
