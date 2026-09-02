import { z } from "zod";
import { KB_RECORD_TYPES } from "../kb-record.schema.js";
import { argvFlag, bundlePath, define } from "./model.js";

export const loadCommand = define({
  name: "load",
  tool: "kb_load",
  usage: "load [type] [--budget N | --all]",
  description:
    "Load the whole base, each record with its standing. First call for any question a base might govern — at the point of use, since compaction drops it. Superseded records arrive as stubs; kb_trace has the history. Refuses with a count when over budget; `all` bypasses that (exclusive with `budgetTokens`), for deliberate use only. Never read record files directly — only the kb_* read tools resolve supersession.",
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
          "Load the entire base regardless of size. The deliberate-operator escape hatch; mutually exclusive with budgetTokens.",
        ),
    })
    .refine((value) => !(value.all && value.budgetTokens !== undefined), {
      message:
        "all and budgetTokens are mutually exclusive: pass a ceiling or none, not both.",
    }),
  fromArgv: (argv, path) => {
    const budget = argvFlag(argv, "--budget");
    return {
      bundlePath: path,
      ...(argv[1] && !argv[1].startsWith("--") ? { type: argv[1] } : {}),
      ...(budget ? { budgetTokens: Number(budget) } : {}),
      ...(argv.includes("--all") ? { all: true } : {}),
    };
  },
  run: async ({ store }, { bundlePath: path, type, budgetTokens, all }) => {
    const result = await store.load(path, {
      ...(type ? { type } : {}),
      ...(budgetTokens ? { budgetTokens } : {}),
      ...(all ? { all } : {}),
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
