import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // The user pin layer reads ~/.strauss by default; tests must never see
    // the developer's real one. Suites that exercise the layer point this at
    // a fixture of their own.
    // The repo cache is the same hazard one step further out: an unwritable
    // default means a test that forgets to point somewhere of its own fails
    // to open a cache rather than reaching the network.
    env: {
      STRAUSS_KB_USER_ROOT: "/nonexistent-strauss-user-root",
      STRAUSS_KB_REPO_CACHE: "/nonexistent-strauss-repo-cache",
      // Remotes are `file://` bare repos on disk so the suite passes unplugged;
      // production refuses that protocol, so the suite has to widen the list.
      STRAUSS_KB_REPO_PROTOCOLS: "https,ssh,git,file",
    },
    // Grammars download on first use; the setup file serves the fixtures over
    // localhost so no test reaches the CDN.
    setupFiles: ["test/grammars.setup.ts"],
    // The bench dry-run suite runs here too: fast, no network, and the only
    // guard between an arm-transform regression and a paid run.
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
