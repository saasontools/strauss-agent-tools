import { z } from "zod";
import { KB_RECORD_TYPES } from "../kb-record.schema.js";
import { argvFlag, bundlePath, define } from "./model.js";

export const loadCommand = define({
  name: "load",
  tool: "kb_load",
  usage: "load [type] [--budget N | --all]",
  description:
    "Load the whole knowledge base at once, each record with its standing. Prefer this over searching: these bases run to a few thousand tokens, and a reader holding all of it has perfect recall and knows why it is asking, which no ranker does. Superseded records arrive under `superseded` as name, replacement and date only — their bodies no longer hold, and reading one later in a long session is the mistake this prevents; pass the id to kb_trace when you need the history. Rejected and unresolved records arrive whole: what was turned down, and what is still open, is the part a diff cannot show you. Refuses with a count rather than truncating when the base is too large — a truncated base is indistinguishable from a complete one, and would have you conclude something was never decided from a slice you did not know was a slice. Call at the point of use, not once per session: a base loaded early is summarised away by compaction, so if the visible context holds no records from this base and the question at hand is one it might govern, load before answering — never conclude nothing was decided from a context with no KB content in it. This tool (with kb_query and kb_trace) is the only supported way to read a base; a raw file read bypasses supersession resolution and returns replaced records as if current.\n\nThat refusal is the default guardrail, meant for an agent that would otherwise burn its whole context on one call. `all` bypasses it and loads everything regardless of size: a deliberate operator with the budget to spend, not something to reach for automatically. It is mutually exclusive with `budgetTokens`. When the reader does not need everything, kb_query or a narrower `type` filter is the better fit than either.",
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
