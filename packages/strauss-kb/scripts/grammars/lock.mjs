// @ts-check
/** Reading packs.json and writing everything the pin generates. */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const grammarsDir = join(root, "grammars");
export const packsPath = join(grammarsDir, "packs.json");
export const manifestPath = join(grammarsDir, "manifest.json");
export const fixturesDir = join(root, "test", "fixtures", "grammars");
export const tagsFixturesDir = join(fixturesDir, "tags");

/**
 * @typedef {{ linguist: string, packs: Record<string, import("./resolve.mjs").Pack> }} Packs
 */

/** @returns {Packs} */
export function readPacks() {
  return JSON.parse(readFileSync(packsPath, "utf8"));
}

/** Sorted by language, so a hand edit anywhere reads back the same. */
export async function writePacks(packs) {
  const sorted = Object.fromEntries(
    Object.entries(packs.packs).sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeJson(packsPath, { ...packs, packs: sorted });
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
export async function writeManifest(lock) {
  const packs = Object.fromEntries(
    Object.entries(lock.packs).sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeJson(manifestPath, {
    webTreeSitter: webTreeSitterVersion(),
    linguist: lock.linguist,
    packs,
  });
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

/** Does the suite carry a WASM fixture for this language? */
export function hasFixture(language) {
  return existsSync(join(fixturesDir, `tree-sitter-${language}.wasm`));
}

/**
 * The tags parts of the fixture languages, named by their hash the way the
 * runtime cache names them, so the suite's server can serve them at the URLs
 * the lock pins. A part two packs share — every TypeScript pack starts from
 * JavaScript's — is one file.
 * @param {Map<string, Uint8Array>} parts @param {(line: string) => void} log
 */
export function syncTagsFixtures(parts, log) {
  mkdirSync(tagsFixturesDir, { recursive: true });
  const wanted = new Set([...parts].map(([sha]) => `${sha.slice(0, 12)}.scm`));
  for (const [sha, body] of parts)
    writeFileSync(join(tagsFixturesDir, `${sha.slice(0, 12)}.scm`), body);
  for (const file of readdirSync(tagsFixturesDir)) {
    if (!file.endsWith(".scm") || wanted.has(file)) continue;
    rmSync(join(tagsFixturesDir, file));
    log(`removed test/fixtures/grammars/tags/${file}: no fixture pack pins it`);
  }
}

/**
 * Written the way the repository's formatter would write it, so a pin run and
 * the pre-commit hook never disagree about the same bytes.
 * @param {string} path @param {unknown} value
 */
async function writeJson(path, value) {
  const body = JSON.stringify(value, null, 2);
  writeFileSync(path, await format(body, { parser: "json", filepath: path }));
}
