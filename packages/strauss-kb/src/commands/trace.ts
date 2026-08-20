import { z } from "zod";
import { TRACE_EDGES } from "../trace.js";
import { bundlePath, conceptId, define } from "./model.js";

export const traceCommand = define({
  name: "trace",
  tool: "kb_trace",
  usage: "trace <concept-id> [edges...]",
  description:
    'How a position was arrived at, as a timeline ordered by when each record was written. Deliberately includes rejected, draft, and superseded records — in a history those are the content, not noise. Follows supersession, shared code anchors, and shared sources. Use when the question is "why is this the way it is" rather than "what do we hold now". This tool (with kb_load and kb_query) is the only supported way to read a base; a raw file read bypasses supersession resolution and returns replaced records as if current.',
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
      status: step.record.frontmatter.strauss_status,
      title: step.record.frontmatter.title ?? null,
      depth: step.depth,
      via: step.via,
      body: step.record.body,
    })),
});
