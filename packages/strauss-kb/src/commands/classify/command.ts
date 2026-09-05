import { z } from "zod";
import {
  classifyDiff,
  type KbClassifiedFile,
  type KbClassifyResult,
} from "../../classify/index.js";
import { DEFAULT_IO_CONCURRENCY, mapLimit } from "../../concurrency.js";
import { readRangeDiff, type RangeDiff } from "../../drift/index.js";
import { KbClassifyInputError } from "../../kb-errors.js";
import { actorClassOf, emitKb } from "../../telemetry/index.js";
import {
  diffFileSchema,
  diffHunkSchema,
  parseUnifiedDiff,
  resolveSymbolRanges,
} from "../match/index.js";
import { argvFlag, bundlePath, define, REPO_ROOT } from "../model.js";
import { readHeader } from "./header-cache.js";

const classifyFileSchema = diffFileSchema.extend({
  hunks: z.array(
    diffHunkSchema.extend({ lines: z.array(z.string()).optional() }),
  ),
  renamedFrom: z
    .string()
    .min(1)
    .optional()
    .describe("Where `git diff -M` says the path came from."),
  similarity: z.number().min(0).max(100).optional(),
});

export const classifyCommand = define({
  name: "classify",
  tool: "kb_classify",
  usage:
    "classify --git <base>..<head> | --stdin [--repo-root <path>] [--offline]",
  description:
    "What kind of change each file carries: test, config, ci, docs, lockfile, generated, boilerplate, rename or source, with the rule that decided it. Derived from the diff and never stored; a `review:generated`, `review:boilerplate` or `review:move` fact anchored on a file overrides the heuristic. kb_match says what sits on a hunk; this says whether to read it.",
  input: z.object({
    bundlePath,
    files: z
      .array(classifyFileSchema)
      .describe("The changed files, each with its line ranges."),
    repoRoot: REPO_ROOT,
    offline: z
      .boolean()
      .optional()
      .describe(
        "Resolve symbol ranges from what is already on disk, never fetching a grammar.",
      ),
  }),
  fromArgv: async (argv, path, stdin) => {
    const repoRoot = argvFlag(argv, "--repo-root");
    const range = argvFlag(argv, "--git");
    const base = {
      bundlePath: path,
      ...(repoRoot !== undefined ? { repoRoot } : {}),
      ...(argv.includes("--offline") ? { offline: true } : {}),
    };

    if (range !== undefined) {
      const diff = await readRangeDiff(repoRoot ?? process.cwd(), range);
      if (!diff.ok) {
        throw new KbClassifyInputError(
          `--git ${range} ${REFUSED[diff.reason]}`,
        );
      }
      return {
        ...base,
        files: parseUnifiedDiff(diff.text, {
          keepEmpty: true,
          withLines: true,
        }),
      };
    }

    if (!argv.includes("--stdin")) {
      throw new KbClassifyInputError(
        "pass --git <base>..<head>, or --stdin with { files } as JSON",
      );
    }
    return { ...base, files: fromStdin(await stdin()) };
  },
  run: async (
    { store, actor },
    { bundlePath: path, files, repoRoot, offline },
  ): Promise<KbClassifyResult> => {
    const started = Date.now();
    const records = await store.list(path);
    const root = repoRoot ?? process.cwd();
    const withHeaders = await mapLimit(
      files,
      DEFAULT_IO_CONCURRENCY,
      async (file) => ({
        ...file,
        header: await readHeader(root, file.filePath),
      }),
    );
    // Resolved as `match` resolves them, over the files the diff names and no
    // others: without them a symbol-scoped override would cover the file.
    const symbolRanges = await resolveSymbolRanges(
      root,
      files,
      records,
      offline === true,
    );
    const classified = classifyDiff(withHeaders, { records, symbolRanges });
    // Counts beside the duration, so cost per pull request can be split later
    // between what the base carries and what the diff does.
    await emitKb("classify", {
      bundle: path,
      actorClass: actorClassOf(actor),
      durationMs: Date.now() - started,
      data: {
        records: records.length,
        files: files.length,
        hunks: files.reduce((total, file) => total + file.hunks.length, 0),
      },
    });
    return { files: classified };
  },
  render: (result) => renderClassify(result as KbClassifyResult),
});

/** What each refusal from `readRangeDiff` reads as, so the CLI names it. */
const REFUSED: Record<Extract<RangeDiff, { ok: false }>["reason"], string> = {
  "bad-range":
    "is not a range git could read here — both halves of <base>..<head> are required",
  "too-large": "diffs to a patch past the output cap — narrow the range",
  timeout: "took longer to diff than the runner allows — narrow the range",
  "git-missing": "needs git on PATH, and there is none",
};

/** The MCP input's `files`, for a caller holding a patch of its own. */
function fromStdin(text: string): unknown {
  let payload: { files?: unknown };
  try {
    payload = JSON.parse(text) as typeof payload;
  } catch {
    throw new KbClassifyInputError("stdin is not JSON");
  }
  if (!Array.isArray(payload?.files)) {
    throw new KbClassifyInputError("stdin needs a files array");
  }
  return payload.files;
}

/** One line per file: the class, the path, and the rule that decided it. */
export function renderClassify(result: KbClassifyResult): string {
  const width = Math.max(
    0,
    ...result.files.map((file: KbClassifiedFile) => file.class.length),
  );
  return result.files
    .map(
      (file) =>
        `${file.class.padEnd(width)}  ${file.filePath}  (${file.reason})`,
    )
    .join("\n");
}
