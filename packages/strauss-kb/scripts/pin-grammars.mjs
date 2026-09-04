#!/usr/bin/env node
// @ts-check
/**
 * Pins `grammars/manifest.json` and refreshes the test fixtures from the CDN.
 *
 * Run by hand, never on install: the WASM is downloaded on first use rather
 * than published, so the manifest — a sha256 per grammar — is the only thing
 * that ships. The grammar ABI is tied to the `web-tree-sitter` minor in
 * package.json; bump both together and run the suite.
 *
 * Usage: node scripts/pin-grammars.mjs [version]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LANGUAGES = ["typescript", "tsx", "javascript", "python", "go", "rust"];
const PACKAGE = "tree-sitter-wasms";
const BASE = "https://cdn.jsdelivr.net/npm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "grammars", "manifest.json");
const version =
  process.argv[2] ??
  /** @type {{ version: string }} */ (
    JSON.parse(readFileSync(manifestPath, "utf8"))
  ).version;

/** @type {Record<string, { sha256: string, bytes: number }>} */
const grammars = {};
for (const language of LANGUAGES) {
  const name = `tree-sitter-${language}.wasm`;
  const url = `${BASE}/${PACKAGE}@${version}/out/${name}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  grammars[language] = { sha256, bytes: bytes.byteLength };
  writeFileSync(join(root, "test", "fixtures", "grammars", name), bytes);
  console.log(`${name}: ${sha256} (${bytes.byteLength} bytes)`);
}

writeFileSync(
  manifestPath,
  `${JSON.stringify({ package: PACKAGE, version, grammars }, null, 2)}\n`,
);
console.log(`pinned ${PACKAGE}@${version} in grammars/manifest.json`);
