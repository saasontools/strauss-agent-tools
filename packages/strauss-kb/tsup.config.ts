import { defineConfig } from "tsup";

// Both formats, deliberately. A downstream consumer that transpiles to
// CommonJS per-file without bundling will `require()` this package at runtime;
// shipping ESM alone would make that work or not depending on whether the
// consumer's Node honours `require(esm)`. Shipping both removes the question.
export default defineConfig({
  entry: ["src/index.ts", "src/cli-main.ts", "src/mcp-main.ts"],
  format: ["esm", "cjs"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  // tsup's declaration pass sets `baseUrl` itself, which TypeScript 6
  // deprecates and errors on. The opt-out belongs here rather than in
  // tsconfig.json: it is tsup's option, not this package's source layout.
  dts: { compilerOptions: { ignoreDeprecations: "6.0" } },
  sourcemap: true,
  // The optional search backend is resolved at runtime or not at all — see
  // src/search-index.ts. Inlining it would make an optional peer mandatory.
  external: ["@tobilu/qmd"],
});
