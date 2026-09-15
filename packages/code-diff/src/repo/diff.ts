import { localRevShapeIsSafe, runGit } from "@saasontools/git-guard";

/** A range diff is a whole change rather than one file, so it gets its own cap. */
export const MAX_RANGE_DIFF_BYTES = 8 * 1_048_576;

const RANGE_DIFF_TIMEOUT_MS = 20_000;

/**
 * `<base>..<head>` or `<base>...<head>`, both halves spelled out. git reads
 * `..head` and `base..` as ranges against `HEAD`; a shape-checked half is the
 * only kind that reaches argv, so the omitted one is refused instead.
 */
const DIFF_RANGE = /^(.+?)(\.{2,3})(.+)$/;

export type ParsedRange = { base: string; dots: ".." | "..."; head: string };

/** The two halves of a range, or nothing when either is missing or unsafe. */
export function parseRange(range: string): ParsedRange | undefined {
  const parts = DIFF_RANGE.exec(range);
  if (!parts) return undefined;
  const [, base = "", dots = "", head = ""] = parts;
  if (!localRevShapeIsSafe(base) || !localRevShapeIsSafe(head)) {
    return undefined;
  }
  return { base, dots: dots === "..." ? "..." : "..", head };
}

/**
 * A zero-context patch. The refusal carries its reason: a range git would not
 * take, a patch past the cap, a timeout and no git are four different things
 * to tell a caller.
 */
export type RangeDiff =
  | { ok: true; text: string }
  | {
      ok: false;
      reason: "bad-range" | "too-large" | "timeout" | "git-missing";
    };

export async function readRangeDiff(
  repoRoot: string,
  range: string,
  maxBytes: number = MAX_RANGE_DIFF_BYTES,
): Promise<RangeDiff> {
  const parsed = parseRange(range);
  if (!parsed) return { ok: false, reason: "bad-range" };
  return diff(repoRoot, `${parsed.base}${parsed.dots}${parsed.head}`, maxBytes);
}

/** `base` against the working tree: committed work plus what is not yet committed. */
export async function readWorkingDiff(
  repoRoot: string,
  base: string,
  maxBytes: number = MAX_RANGE_DIFF_BYTES,
): Promise<RangeDiff> {
  if (!localRevShapeIsSafe(base)) return { ok: false, reason: "bad-range" };
  return diff(repoRoot, base, maxBytes);
}

/**
 * External diff drivers and textconv filters are off — both run a command the
 * repository configured — and the prefixes and `core.quotePath` are pinned so
 * the parser reads one spelling rather than the repo's.
 */
async function diff(
  repoRoot: string,
  revs: string,
  maxBytes: number,
): Promise<RangeDiff> {
  const result = await runGit(
    [
      "-C",
      repoRoot,
      "-c",
      "core.quotePath=false",
      "diff",
      "--unified=0",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
      "--find-renames",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      "--end-of-options",
      revs,
      "--",
    ],
    { maxBytes, timeoutMs: RANGE_DIFF_TIMEOUT_MS },
  );
  if (result.ok) return { ok: true, text: result.stdout };
  return {
    ok: false,
    reason: result.reason === "failed" ? "bad-range" : result.reason,
  };
}

/** The revs `base..head` names, or `base` alone against the working tree. */
export function rangeRevs(base: string, head: string | null): string | null {
  if (!localRevShapeIsSafe(base)) return null;
  if (head === null) return base;
  return localRevShapeIsSafe(head) ? `${base}..${head}` : null;
}
