import rootConfig from "../../eslint.config.js";

export default [
  ...rootConfig,
  {
    // The MCP server's stdout is the JSON-RPC transport and the CLI's stdout is
    // its result; a stray console.log corrupts either. Both write explicitly
    // through process.stdout / process.stderr.
    files: ["src/**/*.ts", "test/**/*.ts"],
    rules: {
      "no-console": "error",
    },
  },
];
