import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { DEFAULT_IO_CONCURRENCY, mapLimit } from "../concurrency.js";
import {
  MAX_ANCHOR_FILE_BYTES,
  type AnchorFileReader,
  type AnchorRead,
  type KbAnchorDriftEntry,
} from "./model.js";

/**
 * An anchor's `file` must stay inside the repository root — a record points
 * at code, not at arbitrary files on the machine reading it. Bundles are
 * data, so a traversal or absolute path here is untrusted input, not a bug
 * in the caller. Returns the resolved path, or `null` when it escapes.
 *
 * Lexical only, and therefore not the whole containment check: see
 * `readAnchorFile`, which re-tests the real path after following symlinks.
 */
export function anchorFilePath(repoRoot: string, file: string): string | null {
  // Anchors are repo-relative, hand-written often enough that `./` shows up.
  const path = resolve(repoRoot, file.replace(/^\.\//, ""));
  const rel = relative(resolve(repoRoot), path);
  if (
    rel === "" ||
    rel === ".." ||
    rel.startsWith(`..${sep}`) ||
    isAbsolute(rel)
  ) {
    return null;
  }
  return path;
}

function contains(root: string, path: string): boolean {
  const rel = relative(root, path);
  return (
    rel !== "" &&
    rel !== ".." &&
    !rel.startsWith(`..${sep}`) &&
    !isAbsolute(rel)
  );
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

/** Resolves the repo root once, then reads anchor files against it. */
export function anchorFileReader(repoRoot: string): AnchorFileReader {
  let rootOnce: Promise<string> | undefined;
  const realRoot = (): Promise<string> => {
    rootOnce ??= realpath(resolve(repoRoot)).catch((error: unknown) => {
      // A rejected promise stays cached forever if left as-is — clear it so
      // the next read retries realpath instead of replaying one transient
      // failure for the rest of the run. This read still reports its own
      // file-missing/file-unreadable result via the catch below.
      rootOnce = undefined;
      throw error;
    });
    return rootOnce;
  };
  return (file) => readAnchorFileWithRoot(repoRoot, file, realRoot);
}

/** Convenience wrapper: resolves the repo root fresh on every call. */
export async function readAnchorFile(
  repoRoot: string,
  file: string,
): Promise<AnchorRead> {
  return readAnchorFileWithRoot(repoRoot, file, () =>
    realpath(resolve(repoRoot)),
  );
}

/**
 * Containment is checked twice: lexically, then again against the realpath'd
 * path — a symlink inside the repo pointing out must not leak reads. Only
 * ENOENT/ENOTDIR is `file-missing`; other read errors are `file-unreadable`.
 */
async function readAnchorFileWithRoot(
  repoRoot: string,
  file: string,
  realRoot: () => Promise<string>,
): Promise<AnchorRead> {
  const lexical = anchorFilePath(repoRoot, file);
  if (lexical === null) return { ok: false, reason: "outside-repo" };

  let root: string;
  let path: string;
  try {
    root = await realRoot();
    path = await realpath(lexical);
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") {
      return { ok: false, reason: "file-missing" };
    }
    return { ok: false, reason: "file-unreadable" };
  }
  if (!contains(root, path)) return { ok: false, reason: "outside-repo" };

  try {
    const stats = await stat(path);
    if (!stats.isFile()) return { ok: false, reason: "file-unreadable" };
    // Anchors point at source. Reading a bundled artefact or a checked-in
    // binary into memory on a read path is a cost with no finding behind it.
    if (stats.size > MAX_ANCHOR_FILE_BYTES) {
      return { ok: false, reason: "file-too-large" };
    }
    return { ok: true, source: await readFile(path, "utf8") };
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") {
      return { ok: false, reason: "file-missing" };
    }
    return { ok: false, reason: "file-unreadable" };
  }
}

/**
 * Every checked anchor failed to find its file at all.
 *
 * The signature of a repo root that was never given rather than of code that
 * moved: a bundle read from somewhere other than the tree it describes misses
 * every file, and reporting that as base-wide drift would train a reader to
 * ignore the warning. One file found anywhere makes the root plausible, and
 * the misses become real findings again.
 */
export function looksLikeWrongRepoRoot(
  drift: Map<string, KbAnchorDriftEntry[]>,
): boolean {
  let checked = 0;
  for (const entries of drift.values()) {
    for (const entry of entries) {
      // An anchor read from another repository's remote says nothing about
      // this root. Counting it either way would be wrong: as a miss it would
      // make a correct root look wrong, and as a hit it would keep a
      // genuinely wrong root from being spotted.
      if (entry.repo !== undefined) continue;
      // An old-side anchor is read from git, not from this root's files, so it
      // can neither vouch for the root nor argue against it.
      if (entry.side === "old") continue;
      checked += 1;
      if (entry.state !== "unresolved" || entry.reason !== "file-missing") {
        return false;
      }
    }
  }
  return checked > 0;
}

/**
 * Reads each distinct file once with at most `concurrency` in flight.
 *
 * A reader that throws is one unreadable file, not a failed run.
 */
export async function readAnchorFiles(
  files: readonly string[],
  read: AnchorFileReader,
  concurrency: number = DEFAULT_IO_CONCURRENCY,
): Promise<Map<string, AnchorRead>> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError(
      `readAnchorFiles: option "concurrency" must be a positive integer, got ${concurrency}`,
    );
  }
  const wanted = [...new Set(files)];
  const results = await mapLimit(wanted, concurrency, async (file) => {
    try {
      return await read(file);
    } catch {
      return { ok: false, reason: "file-unreadable" } as AnchorRead;
    }
  });
  return new Map(wanted.map((file, at) => [file, results[at] as AnchorRead]));
}
