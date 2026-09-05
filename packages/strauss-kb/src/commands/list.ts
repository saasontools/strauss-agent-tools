import { z } from "zod";
import { KB_RECORD_TYPES } from "../kb-record.schema.js";
import {
  argvFlags,
  argvPositional,
  bundlePath,
  define,
  TAGS,
} from "./model.js";

export const listCommand = define({
  name: "list",
  tool: "kb_list",
  usage: "list [type] [--tag T]...",
  description:
    "Every record, optionally one type or tag. For enumerating; use kb_query for a question.",
  input: z.object({
    bundlePath,
    type: z.enum(KB_RECORD_TYPES).optional(),
    tags: TAGS,
  }),
  fromArgv: (argv, path) => {
    const tags = argvFlags(argv, "--tag");
    // The type is the first positional, in either order: a flag in the slot is
    // a flag, and `list --tag review decision` still narrows by type.
    const type = argvPositional(argv, "--tag");
    return {
      bundlePath: path,
      ...(type ? { type } : {}),
      ...(tags.length ? { tags } : {}),
    };
  },
  run: async ({ store }, { bundlePath: path, type, tags }) =>
    (await store.list(path, type, { ...(tags ? { tags } : {}) })).map(
      (record) => ({
        conceptId: record.conceptId,
        title: record.frontmatter.title ?? null,
        description: record.frontmatter.description ?? null,
        status: record.frontmatter.strauss_status,
        anchors: record.frontmatter.strauss_anchors ?? [],
      }),
    ),
});
