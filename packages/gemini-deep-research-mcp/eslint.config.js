import rootConfig from "../../eslint.config.js";

export default [
  ...rootConfig,
  {
    // stdout is the JSON-RPC transport; a stray console.log corrupts it.
    // All diagnostics must go through src/logger.ts (stderr).
    files: ["src/**/*.ts", "test/**/*.ts"],
    rules: {
      "no-console": "error",
    },
  },
  {
    files: ["src/logger.ts"],
    rules: {
      "no-console": "off",
    },
  },
];
