import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { grammarManifestSchema, type GrammarManifest } from "./model.js";

let cached: GrammarManifest | undefined;

/**
 * The shipped `grammars/manifest.json`: the URL, hash and extensions of every
 * language pack. Read once per process.
 */
export function grammarManifest(): GrammarManifest {
  cached ??= grammarManifestSchema.parse(
    JSON.parse(readFileSync(grammarsDataPath("manifest.json"), "utf8")),
  );
  return cached;
}

/**
 * Test seam: stands a lock of the test's own in for the shipped one, so a
 * suite can pin a part the shipped lock does not carry. `undefined` restores.
 */
export function setGrammarManifest(manifest?: GrammarManifest): void {
  cached = manifest;
}

/**
 * A path under the package's shipped `grammars/` directory.
 *
 * Source and bundle sit at different depths under the package root — `src/
 * grammars/` and `dist/` — so the directory is found by walking up rather than
 * by a fixed `..`.
 */
export function grammarsDataPath(...segments: string[]): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let up = 0; up < 5; up++) {
    const candidate = join(dir, "grammars");
    if (existsSync(join(candidate, "manifest.json")))
      return join(candidate, ...segments);
    dir = dirname(dir);
  }
  throw new Error("grammars/manifest.json is missing from the package");
}
