import { createRequire } from "node:module";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The package ships ESM and CJS because a downstream consumer transpiles to
// CommonJS per-file without bundling and will `require()` this at runtime.
// That claim is only worth making if something checks it.
const require = createRequire(import.meta.url);
const dist = (file: string) => resolve("dist", file);

const API = [
  "KbStore",
  "KB_DIR",
  "KB_COMMANDS",
  "DECISION_TYPE",
  "composeRecord",
  "composeDecisionRecord",
  "matchToDiff",
  "adjudicate",
  "trace",
  "validateBundle",
  "kbRecordFrontmatterSchema",
  "RECORD_TYPES",
];

describe("published build", () => {
  it("exposes the public API from the CommonJS build", () => {
    const api = require(dist("index.cjs")) as Record<string, unknown>;

    for (const name of API) expect(api).toHaveProperty(name);
    expect(new (api.KbStore as new () => object)()).toBeInstanceOf(
      api.KbStore as new () => object,
    );
  });

  it("exposes the same public API from the ESM build", async () => {
    const api = (await import(dist("index.js"))) as Record<string, unknown>;

    for (const name of API) expect(api).toHaveProperty(name);
  });

  it.each(["cli-main.js", "mcp-main.js"])(
    "ships %s with a shebang and the executable bit",
    async (file) => {
      const { readFile } = await import("node:fs/promises");
      const source = await readFile(dist(file), "utf8");

      expect(source.startsWith("#!/usr/bin/env node")).toBe(true);
      // 0o111: executable for user, group, and other. A bin without it is a
      // "permission denied" the first time anything runs it from PATH.
      expect(statSync(dist(file)).mode & 0o111).toBe(0o111);
    },
  );
});
