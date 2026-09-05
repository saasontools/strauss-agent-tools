import {
  anchorFileReader,
  prepareResolvers,
  readAnchorFiles,
  regexResolver,
  resolveAnchorSpan,
  type AnchorResolver,
  type FoundDefinition,
} from "../../anchor-resolver/index.js";
import type { KbAnchor, KbRecord } from "../../kb-record.schema.js";
import type { DiffFile, SymbolRange } from "../../match-diff.js";
import { TreeSitterResolver } from "../../tree-sitter-resolver/index.js";

/**
 * One resolver pass over a diff: the anchored symbols that land in it, and —
 * when asked — every definition the changed files declare.
 *
 * Both halves walk the same resolver chain, so a hunk's enclosing symbol and an
 * anchor's span can never disagree about where a definition starts.
 */
export type SymbolPass = {
  ranges: SymbolRange[];
  /** Every definition per changed file. Empty unless `definitions` was asked. */
  definitions: Map<string, SymbolRange[]>;
};

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
  return (await resolveSymbolPass(repoRoot, files, records, offline)).ranges;
}

/** `resolveSymbolRanges`, plus the definition index uncovered hunks need. */
export async function resolveSymbolPass(
  repoRoot: string,
  files: readonly DiffFile[],
  records: readonly KbRecord[],
  offline = false,
  withDefinitions = false,
): Promise<SymbolPass> {
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
  const empty = { ranges: [], definitions: new Map<string, SymbolRange[]>() };
  if (!wanted.length && !withDefinitions) return empty;

  // The chain is built here rather than through `defaultAnchorResolvers` so
  // both halves come from one parse cache: a hunk's enclosing symbol and an
  // anchor's span are then answered by the same resolver.
  const resolvers: AnchorResolver[] = [
    new TreeSitterResolver({ offline }),
    regexResolver,
  ];

  const paths = [
    ...new Set([
      ...wanted.map((anchor) => anchor.file),
      ...(withDefinitions ? files.map((file) => file.filePath) : []),
    ]),
  ];
  const sources = await readAnchorFiles(paths, anchorFileReader(repoRoot));
  await prepareResolvers(resolvers, paths);

  const ranges: SymbolRange[] = [];
  for (const anchor of wanted) {
    const read = sources.get(anchor.file);
    if (!read?.ok) continue;
    let outcome = resolveAnchorSpan(read.source, anchor, resolvers);
    // A grammar that would not load is not a verdict about the symbol, so the
    // heuristic gets the turn the chain denies it. Placing a record on a hunk
    // tolerates an approximate span; drift, which hashes one, does not.
    if (!outcome.ok && outcome.reason === "resolver-unavailable") {
      outcome = resolveAnchorSpan(read.source, anchor, [regexResolver]);
    }
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

  const definitions = new Map<string, SymbolRange[]>();
  if (withDefinitions) {
    for (const file of files) {
      const read = sources.get(file.filePath);
      if (!read?.ok) continue;
      definitions.set(
        file.filePath,
        listDefinitions(resolvers, read.source, file.filePath).map((found) => ({
          file: file.filePath,
          symbol: found.symbol,
          startLine: found.span.startLine,
          endLine: found.span.endLine,
        })),
      );
    }
  }

  return { ranges, definitions };
}

/**
 * The first resolver that can read the file answers for it — tree-sitter where
 * a grammar loaded, the regex heuristic where none did. A runner with no
 * cached grammar still names the symbols, one resolver less precisely.
 */
function listDefinitions(
  resolvers: readonly AnchorResolver[],
  source: string,
  file: string,
): FoundDefinition[] {
  for (const resolver of resolvers) {
    const found = resolver.definitions?.(source, file);
    if (found) return found;
  }
  return [];
}

/**
 * The definition covering these lines, innermost first — a method rather than
 * the class holding it. `null` where nothing declared covers them: an import,
 * a top-level constant, or a shape neither resolver reads as a definition.
 */
export function enclosingSymbol(
  definitions: readonly SymbolRange[] | undefined,
  startLine: number,
  endLine: number,
): string | null {
  let best: SymbolRange | undefined;
  for (const range of definitions ?? []) {
    if (range.startLine > endLine || range.endLine < startLine) continue;
    if (!best || width(range) < width(best)) best = range;
  }
  return best?.symbol ?? null;
}

function width(range: SymbolRange): number {
  return range.endLine - range.startLine;
}

/** Anchors are written by hand often enough that `./` shows up. */
function strip(path: string): string {
  return path.replace(/^\.\//, "");
}
