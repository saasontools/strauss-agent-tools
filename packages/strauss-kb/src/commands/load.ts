import { z } from "zod";
import { KB_RECORD_TYPES } from "../kb-record.schema.js";
import { argvFlag, bundlePath, define, REPO_ROOT } from "./model.js";

export const loadCommand = define({
  name: "load",
  tool: "kb_load",
  usage: "load [type] [--budget N | --all] [--repo-root PATH]",
  description:
    "Loads the whole knowledge base at once, each record with its standing. Superseded records arrive as stubs; rejected and open records arrive whole. Refuses past the token budget rather than truncating — call kb_catalog, then kb_pack on the record that matters; `all` bypasses the budget. Never read record files directly. Cache-stable; reload only when `digest` changes.",
  input: z
    .object({
      bundlePath,
      type: z.enum(KB_RECORD_TYPES).optional(),
      budgetTokens: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Approximate token ceiling. Defaults to 25000."),
      all: z
        .boolean()
        .optional()
        .describe(
          "Loads the entire base regardless of size, bypassing the token budget; mutually exclusive with budgetTokens.",
        ),
      repoRoot: REPO_ROOT,
    })
    .refine((value) => !(value.all && value.budgetTokens !== undefined), {
      message:
        "all is mutually exclusive with budgetTokens: pass a ceiling or none, not both.",
    }),
  fromArgv: (argv, path) => {
    const budget = argvFlag(argv, "--budget");
    const repoRoot = argvFlag(argv, "--repo-root");
    return {
      bundlePath: path,
      ...(argv[1] && !argv[1].startsWith("--") ? { type: argv[1] } : {}),
      ...(budget ? { budgetTokens: Number(budget) } : {}),
      ...(argv.includes("--all") ? { all: true } : {}),
      ...(repoRoot !== undefined ? { repoRoot } : {}),
    };
  },
  run: async (
    { store },
    { bundlePath: path, type, budgetTokens, all, repoRoot },
  ) => {
    const result = await store.load(path, {
      ...(type ? { type } : {}),
      ...(budgetTokens ? { budgetTokens } : {}),
      ...(all ? { all } : {}),
      ...(repoRoot !== undefined ? { repoRoot } : {}),
    });
    if (!result.loaded) return result;
    return {
      ...result,
      records: result.records.map((hit) => ({
        conceptId: hit.record.conceptId,
        title: hit.record.frontmatter.title ?? null,
        standing: hit.standing,
        supersededBy: hit.heads.map((head) => head.conceptId),
        warnings: hit.warnings,
        anchors: hit.record.frontmatter.strauss_anchors ?? [],
        body: hit.record.body,
      })),
    };
  },
});
