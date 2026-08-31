import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // The user pin layer reads ~/.strauss by default; tests must never see
    // the developer's real one. Suites that exercise the layer point this at
    // a fixture of their own.
    env: { STRAUSS_KB_USER_ROOT: "/nonexistent-strauss-user-root" },
    // The bench dry-run suite runs here too. It is fast and needs no network,
    // and it is the only thing standing between a silent arm-transform
    // regression and a run against the real API that costs money to find it.
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts", "bench/**/*.spec.ts"],
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
