import { z } from "zod";
import { readRangeDiff, type RangeDiff } from "../../drift/index.js";
import {
  matchToDiff,
  placeOnHunk,
  symbolRangeIndex,
  type DiffHunk,
  type DiffMatch,
  type SymbolRange,
  type SymbolRangeIndex,
} from "../../match-diff.js";
import { recordSummary } from "../../record-summary.js";
import { argvFlag, bundlePath, define, REPO_ROOT } from "../model.js";
import { KbMatchInputError } from "./errors.js";
import {
  diffFileSchema,
  symbolRangeSchema,
  type KbMatch,
  type KbMatchRecord,
} from "./model.js";
import { parseUnifiedDiff } from "./parse-unified-diff.js";
import { enclosingSymbol, resolveSymbolPass } from "./symbol-ranges.js";

export const matchCommand = define({
  name: "match",
  tool: "kb_match",
  usage:
    "match --git <base>..<head> | --stdin [--repo-root <path>] [--offline] [--include-non-current] [--include-uncovered]",
  description:
    "Which records sit on each changed hunk: the anchored records per file range, current first, each with its standing and the anchor that matched. kb_load hands over a whole base; this narrows a diff. Symbol ranges resolve from repoRoot when omitted; non-current records need includeNonCurrent, and includeUncovered adds a row per changed symbol no record covers.",
  input: z.object({
    bundlePath,
    files: z
      .array(diffFileSchema)
      .describe("The changed files, each with its post-change line ranges."),
    symbolRanges: z
      .array(symbolRangeSchema)
      .optional()
      .describe(
        "Symbol spans the caller already has. Resolved from repoRoot when omitted.",
      ),
    repoRoot: REPO_ROOT,
    offline: z
      .boolean()
      .optional()
      .describe(
        "Resolve symbol ranges from what is already on disk, never fetching a grammar.",
      ),
    includeNonCurrent: z
      .boolean()
      .optional()
      .describe(
        "Return superseded, rejected and unsettled records too, each carrying its standing.",
      ),
    includeUncovered: z
      .boolean()
      .optional()
      .describe(
        "Return one row per changed new-side symbol, each with that symbol and an empty records list where no record sits on it.",
      ),
  }),
  fromArgv: async (argv, path, stdin) => {
    const repoRoot = argvFlag(argv, "--repo-root");
    const range = argvFlag(argv, "--git");
    const base = {
      bundlePath: path,
      ...(repoRoot !== undefined ? { repoRoot } : {}),
      ...(argv.includes("--offline") ? { offline: true } : {}),
      ...(argv.includes("--include-non-current")
        ? { includeNonCurrent: true }
        : {}),
      ...(argv.includes("--include-uncovered")
        ? { includeUncovered: true }
        : {}),
    };

    if (range !== undefined) {
      const diff = await readRangeDiff(repoRoot ?? process.cwd(), range);
      if (!diff.ok) {
        throw new KbMatchInputError(`--git ${range} ${REFUSED[diff.reason]}`);
      }
      return { ...base, files: parseUnifiedDiff(diff.text) };
    }

    if (!argv.includes("--stdin")) {
      throw new KbMatchInputError(
        "pass --git <base>..<head>, or --stdin with { files } as JSON",
      );
    }
    return { ...base, ...fromStdin(await stdin()) };
  },
  run: async (
    { store },
    {
      bundlePath: path,
      files,
      symbolRanges,
      repoRoot,
      offline,
      includeNonCurrent,
      includeUncovered,
    },
  ): Promise<KbMatch[]> => {
    const records = await store.list(path);
    const uncovered = includeUncovered === true;
    // The pass is skipped only when the caller supplied ranges and wants no
    // definition index — the two answer different questions off one parse.
    const pass =
      symbolRanges !== undefined && !uncovered
        ? {
            ranges: symbolRanges,
            definitions: new Map<string, SymbolRange[]>(),
          }
        : await resolveSymbolPass(
            repoRoot ?? process.cwd(),
            files,
            records,
            offline === true,
            uncovered,
          );
    const ranges = symbolRanges ?? pass.ranges;
    // One index for the whole diff: `project` places every kept record again.
    const index = symbolRangeIndex(ranges);

    const matched = matchToDiff(files, records, {
      symbolRanges: ranges,
    }).flatMap((match) => project(match, index, includeNonCurrent === true));
    if (!uncovered) return matched;

    // One row per changed symbol, in diff order, so a caller can enumerate the
    // symbols nothing covers. A hunk whose only records were filtered out lands
    // here with `records: []` — nothing returnable sits on it, the answer.
    //
    // Uncovered rows are new-side only: an old-side hunk numbers the tree that
    // went away, so its lines name the wrong definition now. A matched
    // old-side row still returns; a deletion's survivor is the new-side point.
    const byHunk = new Map(matched.map((match) => [hunkKey(match), match]));
    const rows = new Map<string, KbMatch>();
    for (const file of files) {
      for (const hunk of file.hunks) {
        const at = hunkKey({ filePath: file.filePath, hunk });
        if (hunk.side === "old") {
          const hit = byHunk.get(at);
          if (hit) rows.set(at, hit);
          continue;
        }
        const symbol = enclosingSymbol(
          pass.definitions.get(file.filePath),
          hunk.startLine,
          hunk.endLine,
        );
        const hit = byHunk.get(at);
        const row: KbMatch = hit
          ? { ...hit, symbol }
          : {
              filePath: file.filePath,
              hunk,
              precision: symbol === null ? "file" : "symbol",
              records: [],
              symbol,
            };
        // Several hunks inside one definition are one thing to look at. A row
        // carrying records takes the slot from one carrying none.
        const key = [file.filePath, symbol ?? ""].join("\u0000");
        const kept = rows.get(key);
        if (!kept || (!kept.records.length && row.records.length)) {
          rows.set(key, row);
        }
      }
    }
    return [...rows.values()];
  },
});

/** One hunk's identity, shared by the diff and the match list. */
function hunkKey(at: { filePath: string; hunk: DiffHunk }): string {
  const { startLine, endLine, side } = at.hunk;
  return [at.filePath, side ?? "new", startLine, endLine].join("\u0000");
}

/** What each refusal from `readRangeDiff` reads as, so the CLI names it. */
const REFUSED: Record<Extract<RangeDiff, { ok: false }>["reason"], string> = {
  "bad-range":
    "is not a range git could read here — both halves of <base>..<head> are required",
  "too-large": "diffs to a patch past the output cap — narrow the range",
  timeout: "took longer to diff than the runner allows — narrow the range",
  "git-missing": "needs git on PATH, and there is none",
};

/** The MCP input's `files` and `symbolRanges`, for a caller with no MCP. */
function fromStdin(text: string): {
  files: unknown;
  symbolRanges?: unknown;
} {
  let payload: { files?: unknown; symbolRanges?: unknown };
  try {
    payload = JSON.parse(text) as typeof payload;
  } catch {
    throw new KbMatchInputError("stdin is not JSON");
  }
  if (!Array.isArray(payload?.files)) {
    throw new KbMatchInputError("stdin needs a files array");
  }
  return {
    files: payload.files,
    ...(payload.symbolRanges !== undefined
      ? { symbolRanges: payload.symbolRanges }
      : {}),
  };
}

/**
 * One match as a caller reads it: no bodies, and superseded or rejected
 * records only where they were asked for. A hunk left with nothing drops out
 * rather than coming back empty — unless `includeUncovered` asked for it.
 */
function project(
  match: DiffMatch,
  ranges: SymbolRangeIndex,
  all: boolean,
): KbMatch[] {
  const kept = all
    ? match.records
    : match.records.filter((hit) => hit.standing === "current");
  if (!kept.length) return [];

  const placed = kept.map((hit) => ({
    hit,
    at: placeOnHunk(hit.record, match.filePath, match.hunk, ranges),
  }));

  return [
    {
      filePath: match.filePath,
      hunk: match.hunk,
      // Over the records returned, not the ones matched: a hunk holding only
      // symbol-placed records is not `file` because a dropped one was.
      precision: placed.every(({ at }) => at.kind === "symbol")
        ? "symbol"
        : "file",
      records: placed.map(({ hit, at: { anchor } }): KbMatchRecord => {
        return {
          conceptId: hit.record.conceptId,
          ...recordSummary(hit.record),
          standing: hit.standing,
          supersededBy: hit.heads.map((head) => head.conceptId),
          ...(anchor ? { anchor } : {}),
        };
      }),
    },
  ];
}
