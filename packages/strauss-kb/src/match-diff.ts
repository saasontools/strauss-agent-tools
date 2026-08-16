import { adjudicate, type KbAdjudicated } from "./adjudicate.js";
import type { KbAnchor, KbRecord } from "./kb-record.schema.js";

/**
 * Which records apply to which part of a change.
 *
 * Takes a structural description of a diff rather than a patch, so this package
 * carries no diff parser: callers already have one, and a knowledge base has no
 * business preferring a particular flavour of unified diff.
 *
 * Deterministic on purpose. Every step here is mechanical — the one judgment,
 * whether a matched record is worth showing a reviewer, is deliberately absent.
 * A model placed here would sit between the reviewer and their diff on every
 * review, to answer a question nobody has yet shown needs asking.
 *
 * Distinct from `load()`, which hands a reader the whole base. That answers
 * "does anything address this question"; this answers "what is attached to this
 * code", and an anchor is the author's own statement rather than an inference
 * from one. A reader guessing which record relates to a hunk would be guessing
 * at something already written down — and a diff has dozens of hunks, which is
 * dozens of reader calls against microseconds of matching. Where they compose:
 * this narrows a hunk to a few records, and a reader asked to explain them gets
 * those, not the base.
 */
export type DiffHunk = {
  /** 1-based, inclusive, in the file's post-change line numbering. */
  startLine: number;
  endLine: number;
};

export type DiffFile = {
  /** Repo-relative, matching how anchors are written. */
  filePath: string;
  hunks: DiffHunk[];
};

/**
 * A symbol resolved to lines. Supplied by whatever the caller uses to index
 * symbols; absence is tolerated — see `place()`.
 */
export type SymbolRange = {
  file: string;
  symbol: string;
  startLine: number;
  endLine: number;
};

export type DiffMatch = {
  filePath: string;
  hunk: DiffHunk;
  /** Current records first — what still holds should be read before what does not. */
  records: KbAdjudicated[];
  /**
   * `symbol` when every record here was placed by a resolved symbol range,
   * `file` when at least one fell back to the whole file. Reported rather than
   * hidden: a caller showing a file-level match as though it were pinned to
   * these lines is claiming a precision it does not have.
   */
  precision: "symbol" | "file";
};

export type MatchOptions = {
  /** Without these, symbol anchors degrade to file level rather than vanishing. */
  symbolRanges?: SymbolRange[];
  now?: Date;
};

export function matchToDiff(
  files: DiffFile[],
  records: KbRecord[],
  options: MatchOptions = {},
): DiffMatch[] {
  const ranges = indexRanges(options.symbolRanges ?? []);
  const anchored = records.filter(
    (record) => (record.frontmatter.strauss_anchors ?? []).length > 0,
  );
  const matches: DiffMatch[] = [];

  for (const file of files) {
    const candidates = anchored
      .map((record) => ({
        record,
        anchors: (record.frontmatter.strauss_anchors ?? []).filter(
          (anchor) => normalize(anchor.file) === normalize(file.filePath),
        ),
      }))
      .filter(({ anchors }) => anchors.length > 0);
    if (!candidates.length) continue;

    for (const hunk of file.hunks) {
      const hits: KbRecord[] = [];
      let precision: DiffMatch["precision"] = "symbol";

      for (const { record, anchors } of candidates) {
        const placement = place(anchors, file.filePath, hunk, ranges);
        if (placement === "miss") continue;
        if (placement === "file") precision = "file";
        hits.push(record);
      }

      if (!hits.length) continue;
      matches.push({
        filePath: file.filePath,
        hunk,
        records: order(adjudicate(hits, records, options.now)),
        precision,
      });
    }
  }

  return matches;
}

/**
 * Whether any of a record's anchors puts it on this hunk.
 *
 * An anchor naming only a file is about the whole file, so it lands on every
 * hunk in it. One naming a symbol lands only where that symbol's lines overlap
 * — unless nothing resolved the symbol, in which case it falls back to the file
 * rather than disappearing. A record silently absent because a resolver was
 * unavailable is worse than one shown imprecisely and labelled as such.
 */
function place(
  anchors: KbAnchor[],
  filePath: string,
  hunk: DiffHunk,
  ranges: Map<string, SymbolRange[]>,
): "symbol" | "file" | "miss" {
  let fallback: "file" | "miss" = "miss";

  for (const anchor of anchors) {
    if (!anchor.symbol) return "file";

    const resolved = ranges.get(key(filePath, anchor.symbol));
    if (!resolved?.length) {
      fallback = "file";
      continue;
    }
    if (resolved.some((range) => overlaps(range, hunk))) return "symbol";
  }

  return fallback;
}

function overlaps(range: SymbolRange, hunk: DiffHunk): boolean {
  return range.startLine <= hunk.endLine && hunk.startLine <= range.endLine;
}

/** Current before superseded, then oldest first, so an arc reads in order. */
function order(records: KbAdjudicated[]): KbAdjudicated[] {
  const rank: Record<string, number> = {
    current: 0,
    unsettled: 1,
    open: 2,
    superseded: 3,
    rejected: 4,
  };
  return [...records].sort(
    (left, right) =>
      (rank[left.standing] ?? 9) - (rank[right.standing] ?? 9) ||
      (left.record.frontmatter.generated?.at ?? "").localeCompare(
        right.record.frontmatter.generated?.at ?? "",
      ),
  );
}

function indexRanges(ranges: SymbolRange[]): Map<string, SymbolRange[]> {
  const byKey = new Map<string, SymbolRange[]>();
  for (const range of ranges) {
    const id = key(range.file, range.symbol);
    byKey.set(id, [...(byKey.get(id) ?? []), range]);
  }
  return byKey;
}

function key(file: string, symbol: string): string {
  return `${normalize(file)}#${symbol}`;
}

/** Anchors are written by hand often enough that `./` shows up. */
function normalize(path: string): string {
  return path.replace(/^\.\//, "");
}
