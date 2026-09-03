import {
  anchorFileReader,
  hashAnchorText,
  type AnchorFileReader,
  type KbDriftMovedTo,
} from "../anchor-resolver.js";
import type { KbAnchor } from "../kb-record.schema.js";
import {
  languageForFile,
  TreeSitterResolver,
} from "../tree-sitter-resolver.js";
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
 * The search runs per drifted anchor on a reassessment path a person is
 * waiting on, and a repository is not bounded. Past the cap the answer is "not
 * found", which is the same answer the reader gets today.
 */
export const MAX_MOVED_SEARCH_FILES = 2_000;

export type MovedSearch = {
  /** Cached per run: several anchors of one record usually share a language. */
  find(anchor: KbAnchor): Promise<KbDriftMovedTo | undefined>;
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
  options: { reader?: AnchorFileReader } = {},
): MovedSearch {
  const read = options.reader ?? anchorFileReader(repoRoot);
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
      // An `ast` hash is over a token stream, and a token stream has no line
      // offsets — the window scan below cannot produce one, and the parsed
      // search hashes spans the same way the anchor was stamped.
      if (!stored) return undefined;

      const language = languageForFile(anchor.file);
      if (language) {
        const candidates = await filesForLanguage(language);
        if (!prepared.has(language)) {
          await resolver.prepare(
            candidates.length ? candidates : [anchor.file],
          );
          prepared.add(language);
        }
        for (const file of candidates) {
          const source = await read(file);
          if (!source.ok) continue;
          const normalizedSource = source.source.replace(/\r\n/g, "\n");
          for (const found of resolver.spans(normalizedSource, file)) {
            const text =
              anchor.hash_kind === "ast"
                ? resolver.normalize(found.span.text, file)
                : found.span.text;
            if (text === null || hashAnchorText(text) !== stored) continue;
            // The anchor's own place is where it already looked; finding the
            // hash there would mean it never drifted.
            if (file === anchor.file && found.symbol === anchor.symbol)
              continue;
            return {
              file,
              symbol: found.symbol,
              startLine: found.span.startLine,
              endLine: found.span.endLine,
            };
          }
        }
        return undefined;
      }

      return sameFileWindow(anchor, read, stored);
    },
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
  // one would make the search's negative answer meaningless.
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
