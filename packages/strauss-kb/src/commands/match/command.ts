import { z } from "zod";
import { readRangeDiff, type RangeDiff } from "../../drift/index.js";
import {
  matchToDiff,
  placeOnHunk,
  symbolRangeIndex,
  type DiffMatch,
  type SymbolRangeIndex,
} from "../../match-diff.js";
import { argvFlag, bundlePath, define, REPO_ROOT } from "../model.js";
import { KbMatchInputError } from "./errors.js";
import {
  diffFileSchema,
  symbolRangeSchema,
  type KbMatch,
  type KbMatchRecord,
} from "./model.js";
import { parseUnifiedDiff } from "./parse-unified-diff.js";
import { resolveSymbolRanges } from "./symbol-ranges.js";

export const matchCommand = define({
  name: "match",
  tool: "kb_match",
  usage:
    "match --git <base>..<head> | --stdin [--repo-root <path>] [--offline] [--include-non-current]",
  description:
    "Which records sit on each changed hunk: the anchored records per file range, current first, each with its standing and the anchor that matched. kb_load hands over a whole base; this narrows a diff. Symbol ranges resolve from repoRoot when omitted; non-current records need includeNonCurrent.",
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
    },
  ): Promise<KbMatch[]> => {
    const records = await store.list(path);
    const ranges =
      symbolRanges ??
      (await resolveSymbolRanges(
        repoRoot ?? process.cwd(),
        files,
        records,
        offline === true,
      ));
    // One index for the whole diff: `project` places every kept record again.
    const index = symbolRangeIndex(ranges);

    return matchToDiff(files, records, { symbolRanges: ranges }).flatMap(
      (match) => project(match, index, includeNonCurrent === true),
    );
  },
});

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
 * rather than coming back empty.
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
        const { frontmatter } = hit.record;
        return {
          conceptId: hit.record.conceptId,
          type: frontmatter.type,
          title: frontmatter.title ?? null,
          standing: hit.standing,
          status: frontmatter.strauss_status,
          supersededBy: hit.heads.map((head) => head.conceptId),
          ...(frontmatter.strauss_materiality
            ? { materiality: frontmatter.strauss_materiality }
            : {}),
          ...(frontmatter.strauss_confidence
            ? { confidence: frontmatter.strauss_confidence }
            : {}),
          ...(frontmatter.tags?.length ? { tags: frontmatter.tags } : {}),
          ...(anchor ? { anchor } : {}),
        };
      }),
    },
  ];
}
