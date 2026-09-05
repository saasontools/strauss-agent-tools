import {
  anchorFileReader,
  prepareResolvers,
  readAnchorFiles,
  regexResolver,
  resolveAnchorSpan,
  type AnchorResolver,
  type AnchorUnresolvedReason,
} from "../../anchor-resolver/index.js";
import type { KbAnchor, KbRecord } from "../../kb-record.schema.js";
import type { DiffFile, SymbolRange } from "../../match-diff.js";
import { TreeSitterResolver } from "../../tree-sitter-resolver/index.js";
import {
  blobKeys,
  cachedDefinitions,
  cachedSpan,
  expectedKind,
  isUnreadable,
  rememberDefinitions,
  rememberSpan,
  rememberUnreadable,
  type CachedSpan,
} from "./parsed-cache.js";

/**
 * One resolver pass over a diff: the anchored symbols that land in it, and —
 * when asked — every definition the changed files declare.
 *
 * Both halves come from the same parsed trees, so a hunk's enclosing symbol and
 * an anchor's span can never disagree about where a definition starts.
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

  const paths = [
    ...new Set([
      ...wanted.map((anchor) => anchor.file),
      ...(withDefinitions ? files.map((file) => file.filePath) : []),
    ]),
  ];
  const keys = await blobKeys(repoRoot, paths, offline);

  // What a previous pass in this process already parsed. `match` then
  // `classify` over one range asks the same questions of the same blobs, and
  // the second run should cost a stat per file, not a parse.
  const ranges: SymbolRange[] = [];
  const definitions = new Map<string, SymbolRange[]>();
  const pending: KbAnchor[] = [];
  const unparsed: string[] = [];

  for (const anchor of wanted) {
    const key = keys.get(anchor.file);
    const kind = expectedKind(anchor.file);
    const held = cachedSpan(key, kind, anchor.symbol as string);
    if (held === undefined) {
      if (!isUnreadable(key, kind)) pending.push(anchor);
      continue;
    }
    if (held) {
      ranges.push({
        file: anchor.file,
        symbol: anchor.symbol as string,
        ...held,
      });
    }
  }
  if (withDefinitions) {
    for (const file of files) {
      const key = keys.get(file.filePath);
      const kind = expectedKind(file.filePath);
      const held = cachedDefinitions(key, kind);
      if (held !== undefined) {
        definitions.set(file.filePath, withFile(file.filePath, held));
      } else if (!isUnreadable(key, kind)) unparsed.push(file.filePath);
    }
  }

  const toRead = [
    ...new Set([...pending.map((anchor) => anchor.file), ...unparsed]),
  ];
  if (!toRead.length) return { ranges, definitions };

  // The chain is built here rather than through `defaultAnchorResolvers`
  // because only the tree-sitter half can enumerate a file's definitions, and
  // both halves must come from one parse cache.
  const treeSitter = new TreeSitterResolver({ offline });
  const resolvers: AnchorResolver[] = [treeSitter, regexResolver];

  const sources = await readAnchorFiles(toRead, anchorFileReader(repoRoot));
  await prepareResolvers(resolvers, toRead);

  for (const anchor of pending) {
    const key = keys.get(anchor.file);
    const expected = expectedKind(anchor.file);
    const read = sources.get(anchor.file);
    if (!read?.ok) {
      rememberUnreadable(key, expected);
      continue;
    }
    const outcome = resolveAnchorSpan(read.source, anchor, resolvers);
    const symbol = anchor.symbol as string;
    // A symbol nothing could resolve is simply left out: `matchToDiff` then
    // degrades it to the file rather than dropping the record. Only a verdict
    // the resolver reached is remembered — a grammar that would not load is a
    // condition of this run, and the next one must ask again.
    if (!outcome.ok) {
      if (DETERMINISTIC.has(outcome.reason)) {
        rememberSpan(key, expected, symbol, null);
      }
      continue;
    }
    const span = {
      startLine: outcome.span.startLine,
      endLine: outcome.span.endLine,
    };
    rememberSpan(
      key,
      outcome.resolver === "tree-sitter" ? "tree-sitter" : "regex",
      symbol,
      span,
    );
    ranges.push({ file: anchor.file, symbol, ...span });
  }

  for (const file of unparsed) {
    const key = keys.get(file);
    const expected = expectedKind(file);
    const read = sources.get(file);
    if (!read?.ok) {
      rememberUnreadable(key, expected);
      continue;
    }
    const found = treeSitter.spans(read.source, file).map((entry) => ({
      symbol: entry.symbol,
      startLine: entry.span.startLine,
      endLine: entry.span.endLine,
    }));
    // An empty list from a grammar that never loaded says nothing about the
    // file, so only a parse that happened is remembered.
    if (expected === "regex" || treeSitter.parses(file)) {
      rememberDefinitions(key, expected, found);
    }
    definitions.set(file, withFile(file, found));
  }

  return { ranges, definitions };
}

/** Verdicts a resolver reached about the code, as against about its own run. */
const DETERMINISTIC = new Set<AnchorUnresolvedReason>([
  "symbol-not-found",
  "symbol-ambiguous",
  "span-out-of-range",
]);

function withFile(file: string, spans: readonly CachedSpan[]): SymbolRange[] {
  return spans.map((span) => ({ file, ...span }));
}

/**
 * The definition covering these lines, innermost first — a method rather than
 * the class holding it. `null` where nothing declared covers them: an import,
 * a top-level constant, or a language with no grammar.
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
