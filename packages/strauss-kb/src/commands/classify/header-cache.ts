import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { HEADER_LINES } from "../../classify/index.js";
import { filePathIsSafe } from "../../remote-repo/validate.js";

/**
 * The banner window of a file, cached per blob.
 *
 * `classify` reads the head of every changed file to look for a generator's
 * banner, and a reviewer runs it repeatedly over the same tree — `match` then
 * `classify`, then again after one more commit. A blob that has not moved has
 * the same banner, so the read is paid once.
 */

/** More than the banner window can need, and less than a lockfile costs. */
export const HEADER_BYTES = 65_536;

/** How many blobs one process remembers. An MCP server does not exit. */
const MEMO_LIMIT = 4_096;

/** A cache entry is a banner, never a file: nothing here grows with the file. */
const MAX_ENTRY_BYTES = 64 * 1_024;

/** What one cache directory may hold before a sweep takes the oldest out. */
const MAX_CACHE_ENTRIES = 5_000;
const MAX_CACHE_BYTES = 8 * 1_024 * 1_024;

/** How far a sweep prunes, so the next write is not another sweep. */
const PRUNE_TO = 0.8;

/** `null` is a remembered miss — an unreadable file is not re-opened either. */
const memo = new Map<string, string[] | null>();

/** One sweep per process: the caps are a ceiling, not a quota to hold exactly. */
let swept = false;

/** `STRAUSS_KB_CACHE_DIR` is refused once, however many entries follow. */
let warnedRelative = false;

/** Test seam: a fresh process remembers nothing. */
export function resetHeaderCache(): void {
  memo.clear();
  swept = false;
  warnedRelative = false;
}

/**
 * Where the cross-process half lives, or `null` when it is off.
 * `STRAUSS_KB_CACHE_DIR=off` disables it; any other value relocates it, and a
 * relative one is refused — a cache that moves with the working directory is
 * not one.
 */
export function headerCacheDir(): string | null {
  const set = process.env["STRAUSS_KB_CACHE_DIR"];
  if (set === "off") return null;
  if (!set) return join(homedir(), ".strauss", "cache", "classify");
  if (!isAbsolute(set)) {
    if (!warnedRelative) {
      warnedRelative = true;
      process.stderr.write(
        `strauss-kb: STRAUSS_KB_CACHE_DIR must be an absolute path, got ${set} — caching to disk is off\n`,
      );
    }
    return null;
  }
  return join(resolve(set), "classify");
}

/**
 * The file's banner from the working tree, which `--git <base>..<head>` reads
 * at head. Absent when it is not there — a deletion, or a tree parked
 * elsewhere — and the diff's own added lines answer instead.
 *
 * Keyed by the blob's identity — path, size, mtime — rather than by a hash of
 * its bytes: a content hash costs the very read the cache exists to avoid.
 * The trade is bounded: a rewrite landing on the same size inside one mtime
 * tick is missed until the next write moves either.
 */
export async function readHeader(
  root: string,
  filePath: string,
): Promise<string[] | undefined> {
  // Lexical only: a committed symlink can still point outside the root, and
  // what leaks is one bit — whether the target's head carries a banner.
  if (!filePathIsSafe(filePath)) return undefined;
  const path = join(root, filePath);

  const seen = await blobIdentity(path);
  if (seen === null) return undefined;
  const remembered = memo.get(seen.key);
  if (remembered !== undefined) return remembered ?? undefined;

  const stored = await readEntry(seen.key);
  if (stored !== undefined) return remember(seen.key, stored);

  const read = await readWindow(path, seen);
  // The blob moved between the stat that named it and the read that filled it:
  // the bytes are real, the key is not, so neither half remembers them.
  if (!read.fresh) return read.header ?? undefined;
  await writeEntry(seen.key, read.header);
  return remember(seen.key, read.header);
}

function remember(blob: string, header: string[] | null): string[] | undefined {
  if (memo.size >= MEMO_LIMIT) {
    const oldest = memo.keys().next();
    if (!oldest.done) memo.delete(oldest.value);
  }
  memo.set(blob, header);
  return header ?? undefined;
}

/** Hashed so an entry's name carries neither a path nor a length. */
async function blobIdentity(
  path: string,
): Promise<{ key: string; size: number; mtimeMs: number } | null> {
  try {
    const stats = await stat(path);
    if (!stats.isFile()) return null;
    return {
      key: createHash("sha256")
        .update(`${path}\0${stats.size}\0${stats.mtimeMs}`)
        .digest("hex"),
      size: stats.size,
      mtimeMs: stats.mtimeMs,
    };
  } catch {
    return null;
  }
}

/** At most `HEADER_BYTES`, whatever the file's size. */
async function readWindow(
  path: string,
  seen: { size: number; mtimeMs: number },
): Promise<{ header: string[] | null; fresh: boolean }> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(path, "r");
    const buffer = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0);
    const after = await handle.stat();
    return {
      header: buffer
        .toString("utf8", 0, bytesRead)
        .split("\n")
        .slice(0, HEADER_LINES),
      fresh: after.size === seen.size && after.mtimeMs === seen.mtimeMs,
    };
  } catch {
    return { header: null, fresh: true };
  } finally {
    await handle?.close();
  }
}

function entryPath(dir: string, blob: string): string {
  return join(dir, blob.slice(0, 2), `${blob}.json`);
}

/** A cache that cannot be read is a miss, never a failure. */
async function readEntry(blob: string): Promise<string[] | null | undefined> {
  const dir = headerCacheDir();
  if (dir === null) return undefined;
  const path = entryPath(dir, blob);
  try {
    // Sized before it is read: the cache directory is a place anything could
    // land, and an entry is a banner, so a large file there is not one.
    if ((await stat(path)).size > MAX_ENTRY_BYTES) return undefined;
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (parsed === null) return null;
    return Array.isArray(parsed) && parsed.every((l) => typeof l === "string")
      ? (parsed as string[])
      : undefined;
  } catch {
    return undefined;
  }
}

/** Written through a temp name, so a reader never sees half an entry. */
async function writeEntry(
  blob: string,
  header: string[] | null,
): Promise<void> {
  const dir = headerCacheDir();
  if (dir === null) return;
  const path = entryPath(dir, blob);
  const temp = `${path}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    await mkdir(join(dir, blob.slice(0, 2)), { recursive: true, mode: 0o700 });
    await writeFile(temp, JSON.stringify(header), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temp, path);
  } catch {
    // A cache that cannot be written is not a reason to fail a classify.
  }
  await sweep(dir);
}

/**
 * Takes the oldest entries out once the directory is over either cap.
 *
 * Once per process, after a write: nothing else here grows the directory, and
 * a `readdir` + `stat` per entry is not a cost every classify should pay.
 */
async function sweep(dir: string): Promise<void> {
  if (swept) return;
  swept = true;
  try {
    const found = await readdir(dir, { recursive: true });
    const entries = await Promise.all(
      found
        .filter((name) => name.endsWith(".json"))
        .map(async (name) => {
          const path = join(dir, name);
          const stats = await stat(path);
          return { path, size: stats.size, mtimeMs: stats.mtimeMs };
        }),
    );
    let count = entries.length;
    let bytes = entries.reduce((total, entry) => total + entry.size, 0);
    if (count <= MAX_CACHE_ENTRIES && bytes <= MAX_CACHE_BYTES) return;

    entries.sort((left, right) => left.mtimeMs - right.mtimeMs);
    for (const entry of entries) {
      if (
        count <= MAX_CACHE_ENTRIES * PRUNE_TO &&
        bytes <= MAX_CACHE_BYTES * PRUNE_TO
      ) {
        break;
      }
      await rm(entry.path, { force: true });
      count -= 1;
      bytes -= entry.size;
    }
  } catch {
    // A cache that cannot be swept is still a cache.
  }
}
