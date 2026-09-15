import { z } from "zod";
import type { KbStanding } from "../../adjudicate.js";
import type { DiffHunk } from "../../match-diff.js";
import type {
  KbAnchor,
  KbRecordFrontmatter,
  KbRecordStatus,
} from "../../kb-record.schema.js";

/**
 * One changed range, 1-based and inclusive, in the numbering of its `side`;
 * absent means the post-change side. Open: a field added here later comes back
 * on the hunk an older build echoes.
 */
export const diffHunkSchema = z
  .object({
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    side: z.enum(["old", "new"]).optional(),
  })
  .passthrough();

export const diffFileSchema = z.object({
  filePath: z
    .string()
    .min(1)
    .describe("Repo-relative, spelled the way anchors are."),
  hunks: z.array(diffHunkSchema),
});

export const symbolRangeSchema = z.object({
  file: z.string().min(1),
  symbol: z.string().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
});

/** One record on a hunk: enough to decide whether to read it, and no body. */
export type KbMatchRecord = {
  conceptId: string;
  type: string;
  title: string | null;
  /** Carried on every entry, so a hit is never handed over as a bare match. */
  standing: KbStanding;
  status: KbRecordStatus;
  /** Where the supersession chain ends. Empty while the record still holds. */
  supersededBy: string[];
  materiality?: KbRecordFrontmatter["strauss_materiality"];
  confidence?: KbRecordFrontmatter["strauss_confidence"];
  tags?: string[];
  /** The anchor that put this record on this hunk. */
  anchor?: KbAnchor;
};

export type KbMatch = {
  filePath: string;
  hunk: DiffHunk;
  /** `symbol` when every record here was placed by a resolved symbol range. */
  precision: "symbol" | "file";
  records: KbMatchRecord[];
};
