import { z } from "zod";
import { KB_RECORD_TYPES } from "../kb-record.schema.js";
import { bundlePath, define } from "./model.js";

export const queryCommand = define({
  name: "query",
  tool: "kb_query",
  usage: "query <text...>",
  description:
    "Search and return each match with its standing. Results are flagged, never filtered: a superseded record comes back alongside whatever replaced it, and a rejected one is marked as something explicitly not adopted. This is the lookup-by-wording rung, and the narrowest of the three: use it when you know roughly what the record says. The decision rule around it — while the base fits kb_load's token budget, kb_load it whole, because on this package's measurements a reader holding the whole base answered eight of nine questions whose wording appears in no record where embedding search answered four; once kb_load refuses, kb_catalog for one line per record and then kb_pack on the record the work centres on; and kb_query when the question is a point lookup rather than a neighbourhood. A query cannot tell you that nothing was decided — it returns its nearest hit whatever the distance — so reach for kb_catalog when the question is what exists. Never read record files directly: this tool (with kb_load, kb_catalog, kb_pack and kb_trace) is the only supported way to read a base; a file read bypasses supersession resolution and returns replaced records as if current.",
  input: z.object({
    bundlePath,
    text: z.string().optional(),
    type: z.enum(KB_RECORD_TYPES).optional(),
    includeNonCurrent: z.boolean().optional(),
  }),
  fromArgv: (argv, path) => ({
    bundlePath: path,
    text: argv.slice(1).join(" ").trim(),
    includeNonCurrent: true,
  }),
  run: async ({ store }, { bundlePath: path, text, type, includeNonCurrent }) =>
    (
      await store.query(path, text ?? "", {
        ...(type ? { type } : {}),
        includeNonCurrent: includeNonCurrent === true,
      })
    ).map((hit) => ({
      conceptId: hit.record.conceptId,
      title: hit.record.frontmatter.title ?? null,
      description: hit.record.frontmatter.description ?? null,
      standing: hit.standing,
      supersededBy: hit.heads.map((head) => head.conceptId),
      warnings: hit.warnings,
      body: hit.record.body,
    })),
});
