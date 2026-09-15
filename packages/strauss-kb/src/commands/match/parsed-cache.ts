import { stat } from "node:fs/promises";
import { anchorFilePath } from "../../anchor-resolver/index.js";
import { DEFAULT_IO_CONCURRENCY, mapLimit } from "../../concurrency.js";
import { languageForFile } from "../../tree-sitter-resolver/index.js";

/**
 * What one parse of one blob yields, remembered for the life of the process.
 *
 * `match` and `classify` resolve symbol ranges over the same changed files, one
 * after the other, and a reviewer runs both on the same range. Without this the
 * second command re-reads and re-parses every file the first already did.
 *
 * Keyed by the blob's identity — path, size, mtime — by `offline`, and by the
 * resolver kind: an entry is read under the kind that should answer for the
 * file and written under the kind that did, so a pass whose grammar would not
 * load stores its regex fallback where no later pass reads it.
 */

/** A definition, as `spans` reports it, minus the path it came from. */
export type CachedSpan = { symbol: string; startLine: number; endLine: number };

/** Which resolver a span came from. `span` and a missing name read as regex. */
export type ResolverKind = "tree-sitter" | "regex";

type Entry = {
  /** Every definition the file declares. Absent until one pass asked for them. */
  definitions?: CachedSpan[];
  /** Set once a pass could not read the file: it is not opened again. */
  unreadable?: true;
  /** Per symbol: its range, or `null` where nothing resolved it. */
  symbols: Map<string, { startLine: number; endLine: number } | null>;
};

/** How many blob-and-kind slots are remembered. An MCP server does not exit. */
const LIMIT = 512;

const parsed = new Map<string, Entry>();

/** Test seam: a fresh process remembers nothing. */
export function resetParsedCache(): void {
  parsed.clear();
}

/** The kind that should answer for this file: only a pinned grammar gets the AST. */
export function expectedKind(file: string): ResolverKind {
  return languageForFile(file) ? "tree-sitter" : "regex";
}

/**
 * One key per file, or `null` where it could not be stat'd — an unreadable
 * file has no identity to remember it by, so it is resolved every time.
 */
export async function blobKeys(
  repoRoot: string,
  files: readonly string[],
  offline: boolean,
): Promise<Map<string, string | null>> {
  const keys = await mapLimit(
    files,
    DEFAULT_IO_CONCURRENCY,
    async (file): Promise<string | null> => {
      const path = anchorFilePath(repoRoot, file);
      if (path === null) return null;
      try {
        const stats = await stat(path);
        return stats.isFile()
          ? `${offline ? "offline" : "online"}\0${path}\0${stats.size}\0${stats.mtimeMs}`
          : null;
      } catch {
        return null;
      }
    },
  );
  return new Map(files.map((file, at) => [file, keys[at] as string | null]));
}

/** `undefined` when this blob's symbol has not been resolved yet. */
export function cachedSpan(
  key: string | null | undefined,
  kind: ResolverKind,
  symbol: string,
): { startLine: number; endLine: number } | null | undefined {
  return held(key, kind)?.symbols.get(symbol);
}

export function rememberSpan(
  key: string | null | undefined,
  kind: ResolverKind,
  symbol: string,
  span: { startLine: number; endLine: number } | null,
): void {
  if (!key) return;
  entryOf(slot(key, kind)).symbols.set(symbol, span);
}

/** `undefined` when no pass has enumerated this blob's definitions yet. */
export function cachedDefinitions(
  key: string | null | undefined,
  kind: ResolverKind,
): CachedSpan[] | undefined {
  return held(key, kind)?.definitions;
}

export function rememberDefinitions(
  key: string | null | undefined,
  kind: ResolverKind,
  definitions: CachedSpan[],
): void {
  if (!key) return;
  entryOf(slot(key, kind)).definitions = definitions;
}

/** A file the reader could not open. Remembered so the next pass does not try. */
export function rememberUnreadable(
  key: string | null | undefined,
  kind: ResolverKind,
): void {
  if (!key) return;
  entryOf(slot(key, kind)).unreadable = true;
}

export function isUnreadable(
  key: string | null | undefined,
  kind: ResolverKind,
): boolean {
  return held(key, kind)?.unreadable === true;
}

function slot(key: string, kind: ResolverKind): string {
  return `${kind}\0${key}`;
}

/** LRU: a read moves the slot to the young end, so a hot blob is never evicted. */
function held(
  key: string | null | undefined,
  kind: ResolverKind,
): Entry | undefined {
  if (!key) return undefined;
  const at = slot(key, kind);
  const entry = parsed.get(at);
  if (entry) {
    parsed.delete(at);
    parsed.set(at, entry);
  }
  return entry;
}

function entryOf(at: string): Entry {
  const existing = parsed.get(at);
  if (existing) {
    parsed.delete(at);
    parsed.set(at, existing);
    return existing;
  }
  if (parsed.size >= LIMIT) {
    const oldest = parsed.keys().next();
    if (!oldest.done) parsed.delete(oldest.value);
  }
  const fresh: Entry = { symbols: new Map() };
  parsed.set(at, fresh);
  return fresh;
}
