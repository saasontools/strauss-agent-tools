import rootConfig from "../../eslint.config.js";

export default [
  ...rootConfig,
  {
    // A library: output goes to the caller, never to a stream it does not own.
    files: ["src/**/*.ts", "test/**/*.ts"],
    rules: {
      "no-console": "error",
    },
  },
];
