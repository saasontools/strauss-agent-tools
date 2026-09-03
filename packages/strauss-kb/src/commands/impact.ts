import { z } from "zod";
import { KB_CAUSAL_LINK_RELS } from "../record-types.js";
import { argvFlag, bundlePath, conceptId, define } from "./model.js";

export const impactCommand = define({
  name: "impact",
  tool: "kb_impact",
  usage: "impact <concept-id> [--depth N] [--rels a,b]",
  description:
    "What breaks if this record changes: its transitive set of dependants, each with its standing. Each rel declares which of its ends depends on the other, and the walk follows each rel in its own direction. Naming `related_to` or an unknown rel in `rels` is an error. kb_backlinks gives one flat hop.",
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
