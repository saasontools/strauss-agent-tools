/**
 * A unified diff of two spans, bounded on purpose.
 *
 * The packet exists so a reader can judge without opening the repository, and
 * a diff that has to be scrolled past defeats that as surely as no diff at all.
 * Both caps below are line counts rather than bytes, because what a reader
 * runs out of is attention.
 */

/** Never more than this from one anchor, whatever the record's shape. */
export const MAX_ANCHOR_DIFF_LINES = 200;

/**
 * Shared across a record's anchors, so a ten-anchor record stays as readable as
 * a one-anchor record is. `kb_reassess`'s size ceiling is a whole-packet
 * number, and only a whole-packet budget can hold it.
 */
export const PACKET_DIFF_LINE_BUDGET = 200;

/** Below this an anchor is better dropped than shown as a stub. */
export const MIN_ANCHOR_DIFF_LINES = 12;

/** Each anchor's share of the budget, never above the per-anchor cap. */
export function diffBudget(anchors: number): number {
  if (anchors <= 0) return MAX_ANCHOR_DIFF_LINES;
  return Math.min(
    MAX_ANCHOR_DIFF_LINES,
    Math.max(
      MIN_ANCHOR_DIFF_LINES,
      Math.floor(PACKET_DIFF_LINE_BUDGET / anchors),
    ),
  );
}

export type UnifiedDiff = {
  /** `-`/`+`/` ` prefixed lines, with a `@@` header. */
  text: string;
  added: number;
  removed: number;
  /** Whether the cap cut it short. */
  truncated: boolean;
};

/**
 * One hunk, no context trimming: the two sides are already a symbol's span,
 * so the whole of both is the context a reader wants.
 *
 * The common subsequence is computed over line *hashes* through a simple
 * O(n·m) table. Spans are bounded by the anchor file cap, and a smarter
 * algorithm would be a second thing to be wrong about for a saving nobody can
 * measure at this size.
 */
export function unifiedDiff(
  before: string,
  after: string,
  options: { maxLines?: number; oldLabel?: string; newLabel?: string } = {},
): UnifiedDiff {
  const max = options.maxLines ?? MAX_ANCHOR_DIFF_LINES;
  const left = before.replace(/\r\n/g, "\n").split("\n");
  const right = after.replace(/\r\n/g, "\n").split("\n");

  const body: string[] = [];
  let added = 0;
  let removed = 0;
  for (const edit of edits(left, right)) {
    if (edit.kind === "same") body.push(` ${edit.line}`);
    else if (edit.kind === "remove") {
      body.push(`-${edit.line}`);
      removed += 1;
    } else {
      body.push(`+${edit.line}`);
      added += 1;
    }
  }

  const truncated = body.length > max;
  const shown = truncated ? body.slice(0, max) : body;
  const header = `@@ -1,${left.length} +1,${right.length} @@${
    options.oldLabel
      ? ` ${options.oldLabel} → ${options.newLabel ?? ""}`.trimEnd()
      : ""
  }`;
  const lines = [header, ...shown];
  if (truncated) lines.push(`… ${body.length - max} more diff lines`);

  return { text: lines.join("\n"), added, removed, truncated };
}

type Edit = { kind: "same" | "remove" | "add"; line: string };

/** Longest-common-subsequence backtrack, emitted in source order. */
function edits(left: string[], right: string[]): Edit[] {
  const rows = left.length;
  const cols = right.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () =>
    new Array<number>(cols + 1).fill(0),
  );
  for (let row = rows - 1; row >= 0; row--) {
    for (let col = cols - 1; col >= 0; col--) {
      (table[row] as number[])[col] =
        left[row] === right[col]
          ? ((table[row + 1] as number[])[col + 1] as number) + 1
          : Math.max(
              (table[row + 1] as number[])[col] as number,
              (table[row] as number[])[col + 1] as number,
            );
    }
  }

  const out: Edit[] = [];
  let row = 0;
  let col = 0;
  while (row < rows && col < cols) {
    if (left[row] === right[col]) {
      out.push({ kind: "same", line: left[row] as string });
      row += 1;
      col += 1;
    } else if (
      ((table[row + 1] as number[])[col] as number) >=
      ((table[row] as number[])[col + 1] as number)
    ) {
      out.push({ kind: "remove", line: left[row] as string });
      row += 1;
    } else {
      out.push({ kind: "add", line: right[col] as string });
      col += 1;
    }
  }
  for (; row < rows; row++)
    out.push({ kind: "remove", line: left[row] as string });
  for (; col < cols; col++)
    out.push({ kind: "add", line: right[col] as string });
  return out;
}
