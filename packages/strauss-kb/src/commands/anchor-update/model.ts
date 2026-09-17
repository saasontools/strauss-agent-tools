import { z } from "zod";
import {
  kbAnchorLocatorSchema,
  type KbAnchor,
  type KbAnchorLocator,
} from "../../kb-record.schema.js";

/**
 * A reviewed pointer patch: what to replace, add and remove, and why.
 *
 * A patch rather than a whole array, because the caller read one refactor and
 * not the record: an interface that took the full set would make every
 * unmentioned anchor a deletion the caller never intended. Everything not
 * named here survives untouched, baseline included.
 */
export const anchorPatchInputSchema = z
  .object({
    reason: z
      .string()
      .refine((text) => text.trim().length > 0, {
        message: "reason must say what was reviewed",
      })
      .describe(
        "What the reviewer read that makes these the right pointers. Recorded in the log.",
      ),
    replace: z
      .array(
        z
          .object({ from: kbAnchorLocatorSchema, to: kbAnchorLocatorSchema })
          .strict(),
      )
      .optional()
      .describe(
        "Point an existing anchor somewhere else. `from` must match exactly one anchor; `to` sets only the fields it names, and the hash is kept.",
      ),
    add: z
      .array(kbAnchorLocatorSchema)
      .optional()
      .describe(
        "New anchors, appended in order. They start with no hash: anchor-resolve stamps one.",
      ),
    remove: z
      .array(kbAnchorLocatorSchema)
      .optional()
      .describe("Drop anchors. Each selector must match exactly one."),
  })
  .strict();

export type AnchorPatchInput = z.infer<typeof anchorPatchInputSchema>;

/** One applied change, as the result and the log entry both report it. */
export type KbAnchorChange = {
  op: "replace" | "add" | "remove";
  from?: KbAnchorLocator;
  to?: KbAnchorLocator;
};

/** The anchors to publish, and what getting there took. */
export type KbAnchorPatchResult = {
  anchors: KbAnchor[];
  changes: KbAnchorChange[];
};

export type KbAnchorUpdateResult = {
  conceptId: string;
  reason: string;
  changes: KbAnchorChange[];
  /** The record's anchors after the patch, baselines included. */
  anchors: KbAnchor[];
  /** Always `unchanged`: this command never resolves, stamps or accepts. */
  baseline: "unchanged";
  note: string;
};
