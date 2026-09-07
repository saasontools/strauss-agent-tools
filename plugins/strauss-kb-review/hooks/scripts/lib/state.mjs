// @ts-check
/**
 * Per-session state: the base recorded at SessionStart, the last diff digest,
 * the last base stamp, and how often that digest has been blocked. In
 * `$TMPDIR/strauss-kb/<session>.gate.json` — per session, not per project.
 * Written through a temp file and a rename, so a killed hook leaves nothing
 * half-written.
 */
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * @typedef {{ base: string | null, digest: string | null, stamp: string | null,
 *   blocked: number }} State
 */

/** @param {string} sessionId */
export function statePath(sessionId) {
  const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, "_");
  return join(tmpdir(), "strauss-kb", `${safe}.gate.json`);
}

/** @param {string} path @returns {State} */
export function readState(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return {
      base: typeof parsed?.base === "string" ? parsed.base : null,
      digest: typeof parsed?.digest === "string" ? parsed.digest : null,
      stamp: typeof parsed?.stamp === "string" ? parsed.stamp : null,
      blocked: Number.isInteger(parsed?.blocked) ? parsed.blocked : 0,
    };
  } catch {
    return { base: null, digest: null, stamp: null, blocked: 0 };
  }
}

/** @param {string} path @param {State} state */
export function writeState(path, state) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(state));
    renameSync(temp, path);
  } catch {
    // Unwritable state costs a repeated block, never a failed hook.
  }
}

/** How much of `log.jsonl` the stamp reads: this turn's events and no more. */
const LOG_TAIL_BYTES = 4096;

/**
 * A stand-in for `strauss-kb stamp` on the idle path: names, sizes and mtimes
 * of the bundle's records, plus the tail of the log — a write the store made
 * inside one mtime tick shows up there and nowhere else. The CLI's own stamp
 * costs ~160 ms, more than the whole idle budget.
 * @param {string} bundle
 */
export function bundleStamp(bundle) {
  try {
    const hash = createHash("sha256");
    for (const name of readdirSync(bundle).sort()) {
      const stat = statSync(join(bundle, name));
      hash.update(`${name}:${stat.size}:${stat.mtimeMs}\n`);
    }
    hash.update(logTail(join(bundle, "log.jsonl")));
    return hash.digest("hex");
  } catch {
    return null;
  }
}

/** @param {string} path @returns {Buffer} */
function logTail(path) {
  /** @type {number | null} */
  let handle = null;
  try {
    const size = statSync(path).size;
    const length = Math.min(size, LOG_TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    handle = openSync(path, "r");
    readSync(handle, buffer, 0, length, size - length);
    return buffer;
  } catch {
    // No log yet: the stamp is over the records alone.
    return Buffer.alloc(0);
  } finally {
    if (handle !== null) closeSync(handle);
  }
}
