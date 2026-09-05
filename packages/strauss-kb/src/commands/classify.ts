import { Buffer } from "node:buffer";
import { open, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  classifyDiff,
  HEADER_LINES,
  type KbClassifiedFile,
  type KbClassifyFile,
  type KbClassifyResult,
} from "../classify/index.js";
import { readRangeDiff, type RangeDiff } from "../drift/index.js";
import { KbClassifyInputError } from "../kb-errors.js";
import { filePathIsSafe } from "../remote-repo/validate.js";
import {
  diffFileSchema,
  diffHunkSchema,
  parseUnifiedDiff,
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
    { store },
    { bundlePath: path, files, repoRoot, offline },
  ): Promise<KbClassifyResult> => {
    const records = await store.list(path);
    const root = repoRoot ?? process.cwd();
    const withHeaders = await mapLimit(files, READERS, async (file) => ({
      ...file,
      header: await header(root, file),
    }));
    // Resolved as `match` resolves them, over the files the diff names and no
    // others: without them a symbol-scoped override would cover the file.
    const symbolRanges = await resolveSymbolRanges(
      root,
      files,
      records,
      offline === true,
    );
    return { files: classifyDiff(withHeaders, { records, symbolRanges }) };
  },
  render: (result) => renderClassify(result as KbClassifyResult),
});

/** More than the banner window can need, and less than a lockfile costs. */
const HEADER_BYTES = 65_536;

/** How many files are open at once, whatever the diff's size. */
const READERS = 16;

/**
 * The file's banner from the working tree, which `--git <base>..<head>` reads
 * at head. Absent when it is not there — a deletion, or a tree parked
 * elsewhere — and the diff's own added lines answer instead.
 */
async function header(
  root: string,
  file: KbClassifyFile,
): Promise<string[] | undefined> {
  // Lexical only: a committed symlink can still point outside the root, and
  // what leaks is one bit — whether the target's head carries a banner.
  if (!filePathIsSafe(file.filePath)) return undefined;
  let handle: FileHandle | undefined;
  try {
    handle = await open(join(root, file.filePath), "r");
    const buffer = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0);
    return buffer
      .toString("utf8", 0, bytesRead)
      .split("\n")
      .slice(0, HEADER_LINES);
  } catch {
    return undefined;
  } finally {
    await handle?.close();
  }
}

/** Runs at most `limit` at a time, keeping each result in its input's place. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = Array.from({ length: items.length });
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const at = next;
      next += 1;
      out[at] = await run(items[at] as T);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return out;
}

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
