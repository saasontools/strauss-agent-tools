import { z } from "zod";
import { KB_RECORD_TYPES } from "../kb-record.schema.js";
import { bundlePath, define } from "./model.js";

export const listCommand = define({
  name: "list",
  tool: "kb_list",
  usage: "list [type]",
  description:
    "Every record, optionally one type. For enumerating; use kb_query for a question.",
  input: z.object({ bundlePath, type: z.enum(KB_RECORD_TYPES).optional() }),
  fromArgv: (argv, path) => ({ bundlePath: path, type: argv[1] }),
  run: async ({ store }, { bundlePath: path, type }) =>
    (await store.list(path, type)).map((record) => ({
      conceptId: record.conceptId,
      title: record.frontmatter.title ?? null,
      description: record.frontmatter.description ?? null,
      status: record.frontmatter.strauss_status,
      anchors: record.frontmatter.strauss_anchors ?? [],
    })),
});
