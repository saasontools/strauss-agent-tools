import { z } from "zod";
import { recordSummary } from "../record-summary.js";
import { TRACE_EDGES } from "../trace.js";
import { bundlePath, conceptId, define } from "./model.js";

export const traceCommand = define({
  name: "trace",
  tool: "kb_trace",
  usage: "trace <concept-id> [edges...]",
  description:
    'Timeline of how a position was reached, ordered by write time, following supersession, shared anchors and shared sources. Includes rejected, draft and superseded records — in a history they are the content. For "why is it like this"; kb_load answers "what holds now".',
  input: z.object({
    bundlePath,
    conceptId,
    edges: z.array(z.enum(TRACE_EDGES)).optional(),
    depth: z.number().int().positive().optional(),
  }),
  fromArgv: (argv, path) => ({
    bundlePath: path,
    conceptId: argv[1],
    edges: argv
      .slice(2)
      .filter((edge) => (TRACE_EDGES as readonly string[]).includes(edge)),
  }),
  run: async ({ store }, { bundlePath: path, conceptId: id, edges, depth }) =>
    (
      await store.trace(path, id, {
        ...(edges?.length ? { edges } : {}),
        ...(depth ? { depth } : {}),
      })
    ).map((step) => ({
      conceptId: step.record.conceptId,
      at: step.record.frontmatter.generated?.at ?? null,
      ...recordSummary(step.record),
      depth: step.depth,
      via: step.via,
      body: step.record.body,
    })),
});
