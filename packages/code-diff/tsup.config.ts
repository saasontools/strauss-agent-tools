import { defineConfig } from "tsup";

// ESM and CJS, as strauss-kb ships: a consumer transpiling to CommonJS per
// file will `require()` this at runtime.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  dts: { compilerOptions: { ignoreDeprecations: "6.0" } },
  sourcemap: true,
});
