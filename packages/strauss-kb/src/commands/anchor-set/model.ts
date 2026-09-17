import { z } from "zod";
import { bundlePath, conceptId } from "../model.js";
import {
  kbAnchorWriteSchema,
  type KbAnchor,
  type KbAnchorLocator,
} from "../../kb-record.schema.js";

/**
 * The record's anchors, as the caller means them to end up.
 *
 * A whole set rather than a patch: the caller has just read the record, so it
 * holds every anchor including its baseline, and carrying one forward under a
 * new symbol is a field edit rather than an operation to name. What the command
 * checks is the baseline — `applyAnchorSet`.
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
        "The complete new anchor set. Carry an existing anchor's hash forward to keep its baseline; omit the hash for a new anchor.",
      ),
    dropBaselines: z
      .boolean()
      .optional()
      .describe(
        "Allow the write to discard a stamped anchor. Off by default, so losing evidence is never a typo.",
      ),
  })
  .strict();

export type AnchorSetInput = z.infer<typeof anchorSetInputSchema>;

export const anchorSetCommandInput = z.object({
  bundlePath,
  conceptId,
  input: anchorSetInputSchema,
});

/** One change the write made, as the result and the log entry report it. */
export type KbAnchorChange = {
  /** `move` keeps a baseline under a new address; `add` and `drop` are plain. */
  op: "move" | "add" | "drop";
  from?: KbAnchorLocator;
  to?: KbAnchorLocator;
};

export type KbAnchorSetResult = {
  conceptId: string;
  reason: string;
  /** Unchanged anchors are not listed; a no-op write reports nothing. */
  changes: KbAnchorChange[];
  anchors: KbAnchor[];
  /** Always `unchanged`: this command never resolves, stamps or accepts. */
  baseline: "unchanged";
  note: string;
};
