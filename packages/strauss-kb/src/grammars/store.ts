import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { GrammarWasm } from "./model.js";

/** Where downloaded grammars live. Overridable so a test never writes to `$HOME`. */
export function grammarsCacheRoot(override?: string): string {
  return (
    override ??
    process.env["STRAUSS_KB_GRAMMARS_DIR"] ??
    join(homedir(), ".strauss", "grammars")
  );
}

/**
 * Named by the hash the manifest pins, so a re-pin downloads beside the old
 * file instead of over it and a rollback finds its own still there.
 */
export function grammarCachePath(
  root: string,
  language: string,
  sha256: string,
): string {
  return join(root, language, `${sha256.slice(0, 12)}.wasm`);
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function matches(bytes: Uint8Array, entry: GrammarWasm): boolean {
  return bytes.byteLength === entry.bytes && sha256(bytes) === entry.sha256;
}

/**
 * `true` when the cached file hashes as the manifest says. Checked on every
 * load, not only on download: `$HOME` is writable by anything the user runs
 * and a grammar is code the parser executes. A failing file is deleted.
 */
export async function verifyCached(
  path: string,
  entry: GrammarWasm,
): Promise<boolean> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(path);
  } catch {
    return false;
  }
  if (matches(bytes, entry)) return true;
  await rm(path, { force: true });
  return false;
}

/**
 * Write then `rename`, which is atomic within a filesystem: a second process
 * either sees the old file or the whole new one, never a half-written parser.
 */
export async function writeCached(
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
