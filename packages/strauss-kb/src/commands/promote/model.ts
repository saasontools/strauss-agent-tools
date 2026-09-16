import { z } from "zod";
import { bundlePath, conceptId } from "../model.js";

/** Frontmatter a copy can be told to keep, rather than settle or strip. */
export const CARRIED_FIELDS = [
  "status",
  "verified",
  "tags",
  "anchors",
] as const;
export type KbCarriedField = (typeof CARRIED_FIELDS)[number];

/** What a run does about a record the target base already holds. */
export const CONFLICT_POLICIES = [
  "refuse",
  "skip-human-settled",
  "force",
] as const;
export type KbConflictPolicy = (typeof CONFLICT_POLICIES)[number];

export const promoteInputSchema = z
  .object({
    bundlePath,
    conceptIds: z
      .array(conceptId)
      .min(1)
      .max(64)
      .describe("Records to copy into the target base."),
    to: z
      .string()
      .min(1)
      .describe("Absolute path to the base being promoted into."),
    source: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Where the promotion came from, usually the pull request URL. Recorded on each copy as a source.",
      ),
    carry: z
      .array(z.enum(CARRIED_FIELDS))
      .optional()
      .describe(
        "Frontmatter the copy keeps as it stands: `status`, `verified`, `tags`, `anchors`. Anchors carry either way.",
      ),
    onConflict: z
      .enum(CONFLICT_POLICIES)
      .optional()
      .describe(
        "A record the target already holds: `refuse` (default), `skip-human-settled`, or `force` to overwrite.",
      ),
    force: z
      .boolean()
      .optional()
      .describe('Older spelling of `onConflict: "force"`.'),
  })
  // Two spellings of one policy, so a run that names both has to mean the same
  // thing by them — silently preferring one would overwrite or refuse against
  // the caller's word.
  .refine(
    (input) =>
      input.force !== true ||
      input.onConflict === undefined ||
      input.onConflict === "force",
    {
      message: "--force and --on-conflict disagree — pass one of them",
      path: ["onConflict"],
    },
  );

/** A typed link the copy does not carry, because its target stayed behind. */
export type KbDroppedLink = { target: string; rel: string };

export type KbPromotedRecord = {
  conceptId: string;
  droppedLinks: KbDroppedLink[];
};

/** A record left alone, with the actor whose settling protected it. */
export type KbSkippedRecord = {
  conceptId: string;
  settledBy: string;
};

export type KbPromoteResult = {
  to: string;
  promoted: KbPromotedRecord[];
  skipped: KbSkippedRecord[];
};
