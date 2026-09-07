import { z } from "zod";
import { ACTOR, bundlePath, conceptId } from "../model.js";

/**
 * Listing candidates and promoting share one input, and the two need different
 * arguments. The rule lives here rather than in `run` so both surfaces refuse
 * the same call: the CLI before it dispatches, MCP before the tool runs.
 */
export const promoteInputSchema = z
  .object({
    bundlePath,
    actor: ACTOR,
    conceptIds: z
      .array(conceptId)
      .max(64)
      .optional()
      .describe("Records to copy into the target base. Omit with `list`."),
    to: z
      .string()
      .min(1)
      .optional()
      .describe("Absolute path to the base being promoted into."),
    source: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Where the promotion came from, usually the pull request URL. Recorded on each copy as a source.",
      ),
    force: z
      .boolean()
      .optional()
      .describe("Overwrite a record the target base already holds."),
    list: z
      .boolean()
      .optional()
      .describe("List the source base's candidates instead of promoting."),
  })
  .refine((input) => input.list === true || input.to !== undefined, {
    message: "promote needs a target base — pass --to <bundle>, or --list",
    path: ["to"],
  })
  .refine(
    (input) => input.list === true || (input.conceptIds?.length ?? 0) > 0,
    {
      message: "name at least one concept id to promote, or pass --list",
      path: ["conceptIds"],
    },
  );

/** A typed link the copy does not carry, because its target stayed behind. */
export type KbDroppedLink = { target: string; rel: string };

export type KbPromotedRecord = {
  conceptId: string;
  droppedLinks: KbDroppedLink[];
};

export type KbPromoteCandidate = {
  conceptId: string;
  type: string;
  title: string | null;
  /** The rule that made it a candidate, in the reader's terms. */
  why: string;
};

export type KbPromoteResult =
  | { mode: "list"; candidates: KbPromoteCandidate[] }
  | { mode: "promote"; to: string; promoted: KbPromotedRecord[] };
