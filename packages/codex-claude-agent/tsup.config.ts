import { createRequire } from "node:module";
import { defineConfig } from "tsup";

const { version } = createRequire(import.meta.url)("./package.json") as {
  version: string;
};

// ESM only, unlike the other packages here. This one is a CLI and the library
// behind it, and the library's single dependency-of-record — the Claude Agent
// SDK — is itself ESM: a CommonJS build could not `require()` it, so shipping
// one would mean shipping a half that cannot run.
export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  // tsup's declaration pass sets `baseUrl` itself, which TypeScript 6
  // deprecates and errors on.
  dts: { compilerOptions: { ignoreDeprecations: "6.0" } },
  sourcemap: true,
  // The SDK is a peer of the runtime, not something to inline: it spawns its
  // own subprocess and resolves its own binary relative to its install.
  external: ["@anthropic-ai/claude-agent-sdk"],
  // Reported to the SDK as the calling app. A literal here goes stale the
  // first time this package releases, and nothing downstream would notice.
  define: { __CODEX_CLAUDE_AGENT_VERSION__: JSON.stringify(version) },
});
