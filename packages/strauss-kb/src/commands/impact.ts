import { z } from "zod";
import { KB_CAUSAL_LINK_RELS } from "../record-types.js";
import { argvFlag, bundlePath, conceptId, define } from "./model.js";

export const impactCommand = define({
  name: "impact",
  tool: "kb_impact",
  usage: "impact <concept-id> [--depth N] [--rels a,b]",
  description:
    'What breaks if this record changes: its transitive set of dependants. Use it before superseding, contradicting, or narrowing a record — the answer is the set of records whose claims were written assuming the current one holds, which is exactly what a diff cannot show you. Each rel says which of its two ends depends on the other, and it is not always the source: `A depends_on B` means A needs B, so B\'s dependants include A; `A informs B` means B was shaped by A, so A\'s dependants include B. The walk follows each rel in whichever direction its dependence runs, which is why this is not simply "inbound links". `related_to` carries no dependence and is not followed; naming it — or an unknown rel — in `rels` is an error rather than an empty result, because "nothing breaks" is the one answer you must never receive from a typo. Every result carries its standing; nothing is filtered out, but a superseded or rejected record is reported and not walked through — its own declared edges no longer hold — and every such stopping point is named under `stopped`. Unbounded by default, because a blast radius silently cut at some depth looks exactly like a small one; when `depth` does cut it, `truncated` is true and `unexpanded` names what was left unwalked. For one flat hop of every rel, including `related_to`, use kb_backlinks.',
  input: z.object({
    bundlePath,
    conceptId,
    depth: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Hops out from the record. Unbounded when omitted; a walk this cuts reports truncated: true.",
      ),
    rels: z
      .array(z.enum(KB_CAUSAL_LINK_RELS))
      .optional()
      .describe(
        "Narrow which rels the walk follows. Defaults to every rel that carries a dependence — all but related_to.",
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
