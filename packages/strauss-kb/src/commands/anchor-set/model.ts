import { z } from "zod";
import { bundlePath, conceptId } from "../model.js";
import type { KbAnchorChange } from "../../anchors/index.js";
import { kbAnchorWriteSchema, type KbAnchor } from "../../kb-record.schema.js";

/**
 * The record's anchors, as the caller means them to end up.
 *
 * A whole set rather than a patch: the caller has just read the record, so it
 * holds every anchor including its baseline, and carrying one forward under a
 * new symbol is a field edit rather than an operation to name.
 */
export const anchorSetInputSchema = z
  .object({
    reason: z
      .string()
      .refine((text) => text.trim().length > 0, {
        message: "reason must say what was reviewed",
      })
      .describe(
        "What the reviewer read that makes these the right pointers. Recorded in the log.",
      ),
    anchors: z
      .array(kbAnchorWriteSchema)
      .min(1)
      .describe(
        "The complete new anchor set. Carry an anchor's hash forward to keep drift visible until the new code is read.",
      ),
  })
  .strict();

export type AnchorSetInput = z.infer<typeof anchorSetInputSchema>;

export const anchorSetCommandInput = z.object({
  bundlePath,
  conceptId,
  input: anchorSetInputSchema,
  resolve: z
    .boolean()
    .optional()
    .describe(
      "Also resolve and stamp every anchor against the current code, as anchor-resolve --rebaseline does.",
    ),
  repoRoot: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Where the anchored source lives, for resolve. Defaults to the working directory.",
    ),
  offline: z
    .boolean()
    .optional()
    .describe("With resolve, read foreign anchors from the repo cache only."),
});

export type KbAnchorSetResult = {
  conceptId: string;
  reason: string;
  /** Unchanged anchors are not listed; a no-op write reports nothing. */
  changes: KbAnchorChange[];
  anchors: KbAnchor[];
  /** `stamped` when `resolve` ran; `unchanged` otherwise. */
  baseline: "unchanged" | "stamped";
  /** anchor-resolve's per-anchor results, when `resolve` ran. */
  resolved?: unknown[];
  note: string;
};
