import rootConfig from "../../eslint.config.js";

export default [
  ...rootConfig,
  {
    // The CLI's stdout is its result — `--json` consumers parse the last line
    // of it — so a stray console.log corrupts the contract. Everything the
    // runner emits goes through process.stdout / process.stderr explicitly.
    files: ["src/**/*.ts"],
    rules: {
      "no-console": "error",
    },
  },
];
