import {
  anchorFileReader,
  prepareResolvers,
  readAnchorFiles,
  regexResolver,
  resolveAnchorSpan,
  type AnchorResolver,
  type AnchorUnresolvedReason,
  type FoundDefinition,
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
  type ResolverKind,
} from "./parsed-cache.js";

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

  // The chain is built here rather than through `defaultAnchorResolvers` so
  // both halves come from one parse cache: a hunk's enclosing symbol and an
  // anchor's span are then answered by the same resolver.
  const resolvers: AnchorResolver[] = [
    new TreeSitterResolver({ offline }),
    regexResolver,
  ];

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
    const symbol = anchor.symbol as string;
    let outcome = resolveAnchorSpan(read.source, anchor, resolvers);
    let answered = expected;
    // A grammar that would not load is not a verdict about the symbol, so the
    // heuristic gets the turn the chain denies it. Placing a record on a hunk
    // tolerates an approximate span; drift, which hashes one, does not.
    if (!outcome.ok && outcome.reason === "resolver-unavailable") {
      outcome = resolveAnchorSpan(read.source, anchor, [regexResolver]);
      answered = "regex";
    }
    // A symbol nothing could resolve is simply left out: `matchToDiff` then
    // degrades it to the file rather than dropping the record. Only a verdict
    // the resolver reached is remembered, under the kind that reached it — a
    // grammar that would not load is a condition of this run, and the next one
    // must ask again.
    if (!outcome.ok) {
      if (DETERMINISTIC.has(outcome.reason)) {
        rememberSpan(key, answered, symbol, null);
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
    const read = sources.get(file);
    if (!read?.ok) {
      rememberUnreadable(key, expectedKind(file));
      continue;
    }
    const listed = listDefinitions(resolvers, read.source, file);
    const found = (listed?.found ?? []).map((entry) => ({
      symbol: entry.symbol,
      startLine: entry.span.startLine,
      endLine: entry.span.endLine,
    }));
    // Filed under the kind that answered, so a regex list for a file that has
    // a grammar is never served to a pass expecting the AST. A list no
    // resolver produced says nothing about the file and is not filed.
    if (listed) rememberDefinitions(key, listed.kind, found);
    definitions.set(file, withFile(file, found));
  }

  return { ranges, definitions };
}

/**
 * The first resolver that can read the file answers for it — tree-sitter where
 * a grammar loaded, the regex heuristic where none did. A runner with no
 * cached grammar still names the symbols, one resolver less precisely. Which
 * one answered comes back with the list: only that kind may serve it again.
 */
function listDefinitions(
  resolvers: readonly AnchorResolver[],
  source: string,
  file: string,
): { kind: ResolverKind; found: FoundDefinition[] } | null {
  for (const resolver of resolvers) {
    const found = resolver.definitions?.(source, file);
    if (found) {
      const kind: ResolverKind =
        resolver.name === "tree-sitter" ? "tree-sitter" : "regex";
      return { kind, found };
    }
  }
  return null;
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
