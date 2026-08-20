import { z } from "zod";
import { KB_RECORD_TYPES } from "../kb-record.schema.js";
import { bundlePath, define } from "./model.js";

export const queryCommand = define({
  name: "query",
  tool: "kb_query",
  usage: "query <text...>",
  description:
    "Search and return each match with its standing. Results are flagged, never filtered: a superseded record comes back alongside whatever replaced it, and a rejected one is marked as something explicitly not adopted. Prefer kb_load when the base fits its budget: on this package's measurements, a reader holding the whole base answered eight of nine questions whose wording appears in no record, where embedding search answered four. Never read record files directly — this tool (with kb_load and kb_trace) is the only supported way to read a base; a file read bypasses supersession resolution and returns replaced records as if current.",
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
