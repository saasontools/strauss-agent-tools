import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      // The two *-main.ts files are entry glue — argv slicing and a catch that
      // exits. They are exercised by the spawned-binary suites under test/,
      // which v8 in-process coverage cannot see.
      exclude: ["src/**/*.spec.ts", "src/cli-main.ts", "src/mcp-main.ts"],
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 80,
        branches: 70,
      },
    },
  },
});
