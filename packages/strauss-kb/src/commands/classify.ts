import {
  classifyFiles,
  parseRange,
  parseUnifiedDiff,
  readRangeDiff,
  type ClassifiedFile,
  type RangeDiff,
} from "@saasontools/code-diff";
import { z } from "zod";
import { kbDeclared, type KbClassifyResult } from "../classify/index.js";
import { KbClassifyInputError } from "../kb-errors.js";
import {
  diffFileSchema,
  diffHunkSchema,
  resolveSymbolRanges,
} from "./match/index.js";
import { argvFlag, bundlePath, define, REPO_ROOT } from "./model.js";

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
    "classify --git <base>..<head> | --stdin [--base <rev>] [--repo-root <path>] [--offline]",
  description:
    "Deprecated: moving to strauss-kb-review. What kind of change each file carries — test, config, ci, docs, lockfile, generated, boilerplate, rename or source — and what declared it: a `review:*` fact, a `.gitattributes` entry at the base, a generator banner, else source. kb_match says what sits on a hunk; this says whether to read it.",
  input: z.object({
    bundlePath,
    files: z
      .array(classifyFileSchema)
      .describe("The changed files, each with its line ranges."),
    base: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Commit whose `.gitattributes` decide. Omitted, the working tree does.",
      ),
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
    const base = argvFlag(argv, "--base");
    const common = {
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
      const pinned = base ?? parseRange(range)?.base;
      return {
        ...common,
        ...(pinned !== undefined ? { base: pinned } : {}),
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
    return {
      ...common,
      ...(base !== undefined ? { base } : {}),
      files: fromStdin(await stdin()),
    };
  },
  run: async (
    { store },
    { bundlePath: path, files, base, repoRoot, offline },
  ): Promise<KbClassifyResult> => {
    const records = await store.list(path);
    const root = repoRoot ?? process.cwd();
    // Resolved as `match` resolves them, over the files the diff names and no
    // others: without them a symbol-scoped override would cover the file.
    const symbolRanges = await resolveSymbolRanges(
      root,
      files,
      records,
      offline === true,
    );
    return classifyFiles(root, files, {
      base: base ?? null,
      declared: kbDeclared(records, symbolRanges),
    });
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

/** One line per file — the class, the path, what decided it — then any notes. */
export function renderClassify(result: KbClassifyResult): string {
  const width = Math.max(
    0,
    ...result.files.map((file: ClassifiedFile) => file.class.length),
  );
  return [
    ...result.files.map(
      (file) =>
        `${file.class.padEnd(width)}  ${file.filePath}  (${file.reason})`,
    ),
    ...(result.notes ?? []).map((note) => `note: ${note}`),
  ].join("\n");
}
