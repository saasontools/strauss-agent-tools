import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { grammarManifestSchema, type GrammarManifest } from "./model.js";

let cached: GrammarManifest | undefined;

/**
 * The shipped `grammars/manifest.json`: the pinned `tree-sitter-wasms` version
 * and a sha256 per grammar. Read once per process.
 */
export function grammarManifest(): GrammarManifest {
  cached ??= grammarManifestSchema.parse(
    JSON.parse(readFileSync(manifestPath(), "utf8")),
  );
  return cached;
}

/**
 * Source and bundle sit at different depths under the package root — `src/
 * grammars/` and `dist/` — so the manifest is found by walking up rather than
 * by a fixed `..`.
 */
function manifestPath(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let up = 0; up < 4; up++) {
    const candidate = join(dir, "grammars", "manifest.json");
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error("grammars/manifest.json is missing from the package");
}
