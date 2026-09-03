import { createRequire } from "node:module";
import { defineConfig } from "tsup";

const { version } = createRequire(import.meta.url)("./package.json") as {
  version: string;
};

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
  external: ["@tobilu/qmd", "web-tree-sitter"],
  // `import.meta.url` locates `../grammars` (see tree-sitter-resolver.ts).
  // Without the shim the CJS output has no spelling for it.
  shims: true,
  // `serverInfo.version` is the only thing a client can ask a running server
  // about itself, so it has to be the real one rather than a literal someone
  // remembers to bump. See src/version.ts.
  define: { __STRAUSS_KB_VERSION__: JSON.stringify(version) },
});
