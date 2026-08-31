import { z } from "zod";
import { KB_RECORD_TYPES } from "../kb-record.schema.js";
import { argvFlag, bundlePath, define, REPO_ROOT } from "./model.js";

export const queryCommand = define({
  name: "query",
  tool: "kb_query",
  usage: "query <text...> [--repo-root PATH]",
  description:
    "Search and return each match with its standing. Results are flagged, never filtered: a superseded record comes back alongside whatever replaced it, and a rejected one is marked as something explicitly not adopted. Prefer kb_load when the base fits its budget: on this package's measurements, a reader holding the whole base answered eight of nine questions whose wording appears in no record, where embedding search answered four. Never read record files directly — this tool (with kb_load and kb_trace) is the only supported way to read a base; a file read bypasses supersession resolution and returns replaced records as if current.",
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
