import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/dist/",
      "**/coverage/",
      "**/node_modules/",
      ".nx/",
      "**/bundle/server/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Plain JS in this repo is always Node: config files, build scripts, and
    // the scripts plugin directories ship (which cannot be .ts — plugin dirs
    // have no build step). Without these globals every `process` and `fetch`
    // reads as no-undef, which is why plugin scripts went unlinted for so
    // long. TS files get their globals from @types/node instead.
    files: ["**/*.mjs", "**/*.js", "**/*.cjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
);
