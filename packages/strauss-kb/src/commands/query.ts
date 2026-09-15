import { z } from "zod";
import { KB_RECORD_TYPES } from "../kb-record.schema.js";
import { recordSummary } from "../record-summary.js";
import {
  argvFlag,
  argvFlags,
  argvWithout,
  bundlePath,
  define,
  OPTIONAL_FREE_TEXT,
  REPO_ROOT,
  TAGS,
} from "./model.js";

export const queryCommand = define({
  name: "query",
  tool: "kb_query",
  usage: "query <text...> [--tag T]... [--repo-root PATH]",
  description:
    "Search; every hit carries its standing. Flagged, never filtered: a superseded hit returns with its replacement, a rejected one is marked. Prefer kb_load when the base fits its budget — a full read beats search. Results are volatile: place them at the tail, not the cached prefix. Never read record files directly.",
  input: z.object({
    bundlePath,
    text: OPTIONAL_FREE_TEXT.optional(),
    type: z.enum(KB_RECORD_TYPES).optional(),
    includeNonCurrent: z.boolean().optional(),
    tags: TAGS,
    repoRoot: REPO_ROOT,
  }),
  // Both are flags, so neither's value may fall into the search text.
  fromArgv: (argv, path) => {
    const repoRoot = argvFlag(argv, "--repo-root");
    const tags = argvFlags(argv, "--tag");
    const words = argvWithout(argv.slice(1), "--repo-root", "--tag");
    return {
      bundlePath: path,
      text: words.join(" ").trim(),
      includeNonCurrent: true,
      ...(tags.length ? { tags } : {}),
      ...(repoRoot !== undefined ? { repoRoot } : {}),
    };
  },
  run: async (
    { store },
    { bundlePath: path, text, type, includeNonCurrent, tags, repoRoot },
  ) =>
    (
      await store.query(path, text ?? "", {
        ...(type ? { type } : {}),
        includeNonCurrent: includeNonCurrent === true,
        ...(tags ? { tags } : {}),
        ...(repoRoot !== undefined ? { repoRoot } : {}),
      })
    ).map((hit) => ({
      conceptId: hit.record.conceptId,
      ...recordSummary(hit.record),
      standing: hit.standing,
      supersededBy: hit.heads.map((head) => head.conceptId),
      warnings: hit.warnings,
      body: hit.record.body,
    })),
});
