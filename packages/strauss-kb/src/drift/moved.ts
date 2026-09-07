import { stat } from "node:fs/promises";
import {
  anchorFilePath,
  anchorFileReader,
  hashAnchorText,
  type AnchorFileReader,
  type KbDriftMovedTo,
} from "../anchor-resolver/index.js";
import { DEFAULT_IO_CONCURRENCY, mapLimit } from "../concurrency.js";
import type { KbAnchor } from "../kb-record.schema.js";
import {
  languageForFile,
  TreeSitterResolver,
} from "../tree-sitter-resolver/index.js";
import { listRepoFiles } from "./git.js";

/**
 * Did this exact code turn up somewhere else?
 *
 * The one drift question a machine can close on its own. A file renamed, a
 * function lifted into a new module, a block reordered — the bytes are
 * identical, so the record still describes them, and asking a reader to
 * re-read what they already read would train them to skip the ones that
 * matter.
 *
 * Identity is the stored hash, never a similarity score: "nearly the same
 * code" is exactly the case a reader has to judge.
 */

/**
 * How many repository files one search may parse.
 *
 * The search runs on a reassessment path a person is waiting on, and a
 * repository is not bounded. Past the cap the answer is "not found", which is
 * the same answer the reader gets today.
 */
export const MAX_MOVED_SEARCH_FILES = 2_000;

/**
 * How many candidates are dispatched before the result is checked.
 *
 * The batch is the unit of wasted work: a hit in the first file still costs a
 * whole batch of reads, and a miss in the whole repository costs one round of
 * latency per batch. Large enough that the pool stays fed, small enough that
 * an early hit does not read a repository to find it.
 */
const SEARCH_BATCH = 64;

export type MovedSearch = {
  /**
   * Where this anchor's stored hash turned up, or `undefined`.
   *
   * Shared across every anchor of a run: one `git ls-files`, one parse cache,
   * one set of loaded grammars. A `doctor --drifted` sweep over a base whose
   * records anchor into the same few languages parses each candidate once, not
   * once per drifted anchor.
   */
  find(anchor: KbAnchor): Promise<KbDriftMovedTo | undefined>;
};

export type MovedSearchOptions = {
  /** Test seam: replaces the disk reader. */
  reader?: AnchorFileReader;
  /** Test seam: a candidate's byte size, or `null` when it cannot be known. */
  sizeOf?: (file: string) => Promise<number | null>;
};

/**
 * Repository-wide through tree-sitter, same-file-only without it.
 *
 * The fallback is narrow on purpose. Without a parser there are no definition
 * boundaries, so the only honest search is a sliding window of the recorded
 * line count over one file — which finds a block that moved within its file
 * and nothing else. Widening that to the repository would be a hash collision
 * hunt across every line offset of every file, for an answer no more certain.
 */
export function movedSearch(
  repoRoot: string,
  options: MovedSearchOptions = {},
): MovedSearch {
  const read = options.reader ?? anchorFileReader(repoRoot);
  const sizeOf = options.sizeOf ?? diskSize(repoRoot);
  const resolver = new TreeSitterResolver();
  let repoFiles: Promise<string[]> | undefined;
  const prepared = new Set<string>();

  const filesForLanguage = async (language: string): Promise<string[]> => {
    repoFiles ??= listRepoFiles(repoRoot);
    return (await repoFiles)
      .filter((file) => languageForFile(file) === language)
      .slice(0, MAX_MOVED_SEARCH_FILES);
  };

  return {
    async find(anchor) {
      const stored = anchor.hash;
      if (!stored) return undefined;

      // A span is an arbitrary range, not a definition, so the definition
      // search has nothing to compare it against — only the window can find it.
      if (anchor.span) return sameFileWindow(anchor, read, stored);

      const language = languageForFile(anchor.file);
      // No grammar means no token stream, and an `ast` hash can only be
      // compared against one. Comparing it to a raw hash would be comparing
      // two different measurements and calling a mismatch a move.
      if (!language) return sameFileWindow(anchor, read, stored);

      const candidates = await filesForLanguage(language);
      if (!prepared.has(language)) {
        await resolver.prepare(candidates.length ? candidates : [anchor.file]);
        prepared.add(language);
      }
      // A file smaller than the span cannot contain it. One `stat` is far
      // cheaper than a read and a parse, and in a repository of small modules
      // it is most of the candidates.
      const floor = anchor.lines ?? 0;

      for (let at = 0; at < candidates.length; at += SEARCH_BATCH) {
        const batch = candidates.slice(at, at + SEARCH_BATCH);
        const hits = await mapLimit(
          batch,
          DEFAULT_IO_CONCURRENCY,
          async (file) => {
            const size = await sizeOf(file);
            // One byte per line is the floor a file of that many lines cannot
            // go under. `null` is "unknown", which reads rather than skips.
            if (size !== null && size < floor) return undefined;
            return matchIn(resolver, read, anchor, stored, file);
          },
        );
        // Index order, not completion order: the same repository must always
        // report the same destination.
        const found = hits.find((hit) => hit !== undefined);
        if (found) return found;
      }
      return undefined;
    },
  };
}

/** The stored hash at some definition in `file`, or `undefined`. */
async function matchIn(
  resolver: TreeSitterResolver,
  read: AnchorFileReader,
  anchor: KbAnchor,
  stored: string,
  file: string,
): Promise<KbDriftMovedTo | undefined> {
  const source = await read(file);
  if (!source.ok) return undefined;
  const normalized = source.source.replace(/\r\n/g, "\n");

  for (const found of resolver.spans(normalized, file)) {
    // Hashed the way the anchor was stamped: an `ast` hash is only ever
    // compared against a token stream, a raw hash only against raw text.
    const text =
      anchor.hash_kind === "ast"
        ? resolver.normalize(found.span.text, file)
        : found.span.text;
    if (text === null || hashAnchorText(text) !== stored) continue;
    // The anchor's own place is where it already looked; finding the hash
    // there would mean it never drifted.
    if (file === anchor.file && found.symbol === anchor.symbol) continue;
    return {
      file,
      symbol: found.symbol,
      startLine: found.span.startLine,
      endLine: found.span.endLine,
    };
  }
  return undefined;
}

/** `stat` under the repository root; `null` for anything it cannot size. */
function diskSize(repoRoot: string): (file: string) => Promise<number | null> {
  return async (file) => {
    const path = anchorFilePath(repoRoot, file);
    if (path === null) return null;
    try {
      return (await stat(path)).size;
    } catch {
      return null;
    }
  };
}

/** A block of the recorded line count, at some other offset in the same file. */
async function sameFileWindow(
  anchor: KbAnchor,
  read: AnchorFileReader,
  stored: string,
): Promise<KbDriftMovedTo | undefined> {
  const height = anchor.lines;
  // Without a recorded line count there is no window to slide, and guessing
  // one would make the search's negative answer meaningless. An `ast` hash is
  // over a token stream, which has no line offsets to slide over at all.
  if (!height || anchor.hash_kind === "ast") return undefined;

  const source = await read(anchor.file);
  if (!source.ok) return undefined;
  const lines = source.source.replace(/\r\n/g, "\n").split("\n");

  for (let at = 0; at + height <= lines.length; at++) {
    if (hashAnchorText(lines.slice(at, at + height).join("\n")) !== stored) {
      continue;
    }
    return {
      file: anchor.file,
      ...(anchor.symbol ? { symbol: anchor.symbol } : {}),
      startLine: at + 1,
      endLine: at + height,
    };
  }
  return undefined;
}
