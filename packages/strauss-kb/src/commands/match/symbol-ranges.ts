import {
  anchorFileReader,
  defaultAnchorResolvers,
  prepareResolvers,
  readAnchorFiles,
  resolveAnchorSpan,
} from "../../anchor-resolver/index.js";
import type { KbAnchor, KbRecord } from "../../kb-record.schema.js";
import type { DiffFile, SymbolRange } from "../../match-diff.js";

/**
 * The symbol anchors that land in a diff, resolved to line ranges through the
 * package's own chain — tree-sitter, then the regex heuristic.
 *
 * Only the files the diff names are read. A base describes a repository, and
 * resolving all of it to place a handful of hunks is work with no match behind
 * it. An anchor naming another repository is skipped: the diff is this one's.
 * `offline` keeps the resolvers off the network, as `anchor-resolve` does.
 */
export async function resolveSymbolRanges(
  repoRoot: string,
  files: readonly DiffFile[],
  records: readonly KbRecord[],
  offline = false,
): Promise<SymbolRange[]> {
  const changed = new Set(files.map((file) => strip(file.filePath)));
  const wanted: KbAnchor[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    for (const anchor of record.frontmatter.strauss_anchors ?? []) {
      if (!anchor.symbol || anchor.repo) continue;
      if (!changed.has(strip(anchor.file))) continue;
      const key = `${strip(anchor.file)}#${anchor.symbol}`;
      if (seen.has(key)) continue;
      seen.add(key);
      wanted.push(anchor);
    }
  }
  if (!wanted.length) return [];

  const paths = [...new Set(wanted.map((anchor) => anchor.file))];
  const sources = await readAnchorFiles(paths, anchorFileReader(repoRoot));
  const resolvers = defaultAnchorResolvers({ offline });
  await prepareResolvers(resolvers, paths);

  const ranges: SymbolRange[] = [];
  for (const anchor of wanted) {
    const read = sources.get(anchor.file);
    if (!read?.ok) continue;
    const outcome = resolveAnchorSpan(read.source, anchor, resolvers);
    // A symbol nothing could resolve is simply left out: `matchToDiff` then
    // degrades it to the file rather than dropping the record.
    if (!outcome.ok) continue;
    ranges.push({
      file: anchor.file,
      symbol: anchor.symbol as string,
      startLine: outcome.span.startLine,
      endLine: outcome.span.endLine,
    });
  }
  return ranges;
}

/** Anchors are written by hand often enough that `./` shows up. */
function strip(path: string): string {
  return path.replace(/^\.\//, "");
}
