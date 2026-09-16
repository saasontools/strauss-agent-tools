/** One changed range, 1-based and inclusive, in the numbering of its `side`. */
export type DiffHunk = {
  startLine: number;
  endLine: number;
  /** Which half of the change these lines number; absent means `new`. */
  side?: "old" | "new";
  /** This hunk's own changed lines, markers stripped, where a parser kept them. */
  lines?: string[];
  /** git's function context — the text after `@@ … @@` — where a parser kept it. */
  context?: string;
};

export type DiffFile = {
  /** Repo-relative, spelled the way anchors are. */
  filePath: string;
  hunks: DiffHunk[];
  /** Where `git diff -M` says this path came from, and how alike the two are. */
  renamedFrom?: string;
  similarity?: number;
};

/** A symbol resolved to lines by whatever indexes the caller's symbols. */
export type SymbolRange = {
  file: string;
  symbol: string;
  startLine: number;
  endLine: number;
  /** Which side these lines number; absent means `new`, as on a hunk. */
  side?: "old" | "new";
};
