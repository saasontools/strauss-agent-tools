// @ts-check
/** Reading packs.json and writing everything the pin generates. */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const grammarsDir = join(root, "grammars");
export const tagsDir = join(grammarsDir, "tags");
export const packsPath = join(grammarsDir, "packs.json");
export const manifestPath = join(grammarsDir, "manifest.json");
export const fixturesDir = join(root, "test", "fixtures", "grammars");

/**
 * @typedef {{ linguist: string, packs: Record<string, import("./resolve.mjs").Pack> }} Packs
 */

/** @returns {Packs} */
export function readPacks() {
  return JSON.parse(readFileSync(packsPath, "utf8"));
}

/** Sorted by language, so a hand edit anywhere reads back the same. */
export function writePacks(packs) {
  const sorted = Object.fromEntries(
    Object.entries(packs.packs).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(packsPath, `${json({ ...packs, packs: sorted })}\n`);
}

export function readManifest() {
  return existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : { packs: {} };
}

/** The runtime that grammars and queries were proved against. */
export function webTreeSitterVersion() {
  return JSON.parse(
    readFileSync(
      join(root, "node_modules", "web-tree-sitter", "package.json"),
      "utf8",
    ),
  ).version;
}

/**
 * The lock: fully-resolved URLs and hashes for both parts of every pack, plus
 * the extension table the runtime reads. Sorted keys and LF, so the same
 * packs.json over the same registry state writes the same bytes.
 * @param {{ linguist: { tag: string, commit: string }, packs: Record<string, unknown> }} lock
 */
export function writeManifest(lock) {
  const packs = Object.fromEntries(
    Object.entries(lock.packs).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(
    manifestPath,
    `${json({
      webTreeSitter: webTreeSitterVersion(),
      linguist: lock.linguist,
      packs,
    })}\n`,
  );
}

/**
 * The vendored queries, each headed by the URLs it came from. A language whose
 * pack declares no tags leaves no file: it parses but resolves nothing.
 * @param {Map<string, string>} queries
 */
export function writeTags(queries, log) {
  mkdirSync(tagsDir, { recursive: true });
  for (const [language, body] of queries)
    writeFileSync(join(tagsDir, `${language}.scm`), `${body.trimEnd()}\n`);
  for (const file of readdirSync(tagsDir)) {
    if (!file.endsWith(".scm")) continue;
    if (queries.has(file.slice(0, -".scm".length))) continue;
    rmSync(join(tagsDir, file));
    log(`removed grammars/tags/${file}: the pack declares no tags query`);
  }
}

/**
 * Fixtures exist only for the languages the suite parses; the rest would add
 * megabytes to the repository for nothing. They are replaced in place, so the
 * set of fixture languages is what is already committed.
 * @param {string} language @param {Uint8Array} bytes
 */
export function refreshFixture(language, bytes) {
  const path = join(fixturesDir, `tree-sitter-${language}.wasm`);
  if (!existsSync(path)) return false;
  writeFileSync(path, bytes);
  return true;
}

/** @param {unknown} value */
export function json(value) {
  return JSON.stringify(value, null, 2);
}
