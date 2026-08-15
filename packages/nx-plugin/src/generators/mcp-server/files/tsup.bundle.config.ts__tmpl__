import { defineConfig } from "tsup";

// MCPB build: everything is inlined into a single file for Claude Desktop.
// CJS dependencies (e.g. google-auth-library) do dynamic require() of node
// builtins, which crashes a pure ESM bundle at startup unless the banner
// provides a CJS-compatible require via createRequire.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "bundle/server",
  clean: true,
  noExternal: [/.*/],
  banner: {
    js: [
      "#!/usr/bin/env node",
      "import { createRequire as __createRequire } from 'node:module';",
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
});
