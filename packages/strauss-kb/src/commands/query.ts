import { z } from "zod";
import { KB_RECORD_TYPES } from "../kb-record.schema.js";
import { argvFlag, bundlePath, define, REPO_ROOT } from "./model.js";

export const queryCommand = define({
  name: "query",
  tool: "kb_query",
  usage: "query <text...> [--repo-root PATH]",
  description:
    "Search; every hit carries its standing. Flagged, never filtered: a superseded hit returns with its replacement, a rejected one is marked. Prefer kb_load when the base fits its budget — a full read beats search. Never read record files directly.",
  input: z.object({
    bundlePath,
    text: z.string().optional(),
    type: z.enum(KB_RECORD_TYPES).optional(),
    includeNonCurrent: z.boolean().optional(),
    repoRoot: REPO_ROOT,
  }),
  // `--repo-root` is a flag, so its value must not fall into the search text.
  fromArgv: (argv, path) => {
    const repoRoot = argvFlag(argv, "--repo-root");
    const words = argv.slice(1);
    const flag = words.indexOf("--repo-root");
    if (flag !== -1) words.splice(flag, 2);
    return {
      bundlePath: path,
      text: words.join(" ").trim(),
      includeNonCurrent: true,
      ...(repoRoot !== undefined ? { repoRoot } : {}),
    };
  },
  run: async (
    { store },
    { bundlePath: path, text, type, includeNonCurrent, repoRoot },
  ) =>
    (
      await store.query(path, text ?? "", {
        ...(type ? { type } : {}),
        includeNonCurrent: includeNonCurrent === true,
        ...(repoRoot !== undefined ? { repoRoot } : {}),
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
