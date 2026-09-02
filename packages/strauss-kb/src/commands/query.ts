import { z } from "zod";
import { KB_RECORD_TYPES } from "../kb-record.schema.js";
import { bundlePath, define } from "./model.js";

export const queryCommand = define({
  name: "query",
  tool: "kb_query",
  usage: "query <text...>",
  description:
    "Search; every hit carries its standing. Flagged, never filtered: a superseded hit returns with its replacement, a rejected one is marked. Prefer kb_load when the base fits its budget — a full read beats search. Never read record files directly.",
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
