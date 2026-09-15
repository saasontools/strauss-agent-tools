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
      // tsup writes its config to a temp file beside the real one and deletes
      // it when the build ends. Nx runs `lint` and `build` for a project in
      // parallel, so eslint can glob that file and then fail to open it —
      // an ENOENT that has nothing to do with the code being linted, and
      // that only shows up when the two happen to overlap.
      "**/tsup.config.bundled_*.mjs",
      // Fixture trees are diff material: synthetic sources that exist to be
      // changed and anchored to, never built. See
      // fixtures/companion-repo/README.md.
      "fixtures/**/base/",
      "fixtures/**/head/",
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
