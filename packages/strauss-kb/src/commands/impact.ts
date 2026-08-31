import { z } from "zod";
import { KB_LINK_RELS } from "../record-types.js";
import { argvFlag, bundlePath, conceptId, define } from "./model.js";

export const impactCommand = define({
  name: "impact",
  tool: "kb_impact",
  usage: "impact <concept-id> [--depth N] [--rels a,b]",
  description:
    "What breaks if this record changes. Walks the typed causal links (`strauss_links`) inbound and transitively: an edge lives on its source and reads source → target, so `A depends_on B` means A needs B, and asking for B's impact returns A, then whatever depends on A, and so on. Use it before superseding, contradicting, or narrowing a record — the answer is the set of records whose claims were written assuming the current one holds, which is exactly what a diff cannot show you. `related_to` is not followed: it exists to say \"worth reading, no claim of dependence\", and following it turns a blast radius into a bibliography. Every result carries its standing; nothing is filtered out, but a superseded or rejected record is reported and not walked through — its own declared edges no longer hold — and every such stopping point is named under `stopped` so the walk's end is knowable rather than inferred. Unbounded by default, because a blast radius silently cut at some depth looks exactly like a small one. The outbound direction needs no tool: a record's own `strauss_links` are on the record. For one hop of any rel, including `related_to`, use kb_backlinks.",
  input: z.object({
    bundlePath,
    conceptId,
    depth: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Hops out from the record. Unbounded when omitted."),
    rels: z
      .array(z.enum(KB_LINK_RELS))
      .optional()
      .describe(
        "Narrow which rels the walk follows. Defaults to every rel but related_to.",
      ),
  }),
  fromArgv: (argv, path) => {
    const depth = argvFlag(argv, "--depth");
    const rels = argvFlag(argv, "--rels");
    return {
      bundlePath: path,
      conceptId: argv[1],
      ...(depth ? { depth: Number(depth) } : {}),
      ...(rels ? { rels: rels.split(",").filter(Boolean) } : {}),
    };
  },
  run: async ({ store }, { bundlePath: path, conceptId: id, depth, rels }) =>
    store.impact(path, id, {
      ...(depth !== undefined ? { depth } : {}),
      ...(rels?.length ? { rels } : {}),
    }),
});
