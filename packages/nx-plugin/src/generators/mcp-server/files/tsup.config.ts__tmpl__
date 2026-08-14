import { defineConfig } from "tsup";

// npm build: dependencies stay external and are installed from the registry.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" },
});
