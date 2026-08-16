import { z } from "zod";
import {
  composeInputSchema,
  composeRecord,
  type ComposedRecord,
} from "./compose.js";
import type { KbRecord } from "./kb-record.schema.js";

/**
 * The record written while a change is being made: why it is shaped the way it
 * is, anchored to the symbols it touches.
 *
 * A decision is the one thing a later pass cannot recover. The diff shows what
 * changed; nothing in it says which alternative was rejected, or which
 * constraint a future reader would otherwise "simplify" away. Everything else a
 * review needs — categories, moves, formatting — is derivable from the finished
 * diff and does not belong here.
 */
export const DECISION_TYPE = "decision";

/**
 * Slug for the explicit "nothing to record here" answer.
 *
 * Gating on "did you write a decision?" rewards writing a junk decision. Gating
 * on "did you answer?" does not, so silence has to be expressible as a claim:
 * one record, one sentence, auditable after the fact. Work that genuinely
 * needed no decision says so; work that says nothing at all is the case worth
 * surfacing.
 */
export const NO_DECISION_SLUG = "none";

/**
 * Decisions keep a typed input of their own where the generic composer takes a
 * section map. `alternative` is not a nicety here — "what was rejected" is the
 * part of a decision that a later reader cannot reconstruct, so it gets a field
 * rather than a heading a writer may forget to fill.
 */
export const decisionInputSchema = composeInputSchema
  .omit({ sections: true })
  .extend({
    alternative: z.string().min(1).optional(),
    impact: z.string().min(1).optional(),
  })
  .strict();

export type DecisionInput = z.infer<typeof decisionInputSchema>;

export function composeDecisionRecord(
  input: DecisionInput,
  writtenBy: string,
  writtenAt: string,
): ComposedRecord {
  const { alternative, impact, ...rest } = input;
  return composeRecord(
    DECISION_TYPE,
    {
      ...rest,
      sections: {
        Decision: input.title,
        Rationale: input.why,
        ...(alternative ? { Rejected: alternative } : {}),
        ...(impact ? { Impact: impact } : {}),
      },
    },
    writtenBy,
    writtenAt,
  );
}

/** The explicit no-decision claim, so an absence and an answer stay distinct. */
export function composeNoDecisionRecord(
  reason: string,
  writtenBy: string,
  writtenAt: string,
): ComposedRecord {
  return composeRecord(
    DECISION_TYPE,
    {
      slug: NO_DECISION_SLUG,
      title: "No decision to record",
      why: reason,
      sections: { Decision: reason },
    },
    writtenBy,
    writtenAt,
  );
}

/** Whether a record is the explicit no-decision claim rather than a decision. */
export function isNoDecisionRecord(record: KbRecord): boolean {
  return record.conceptId === `${DECISION_TYPE}.${NO_DECISION_SLUG}`;
}

/**
 * Decisions in the bundle, excluding the no-decision claim.
 *
 * Callers asking "what was decided" must not be handed the record that exists
 * precisely to say nothing was.
 */
export function selectDecisions(records: KbRecord[]): KbRecord[] {
  return records.filter(
    (record) =>
      record.conceptId.startsWith(`${DECISION_TYPE}.`) &&
      !isNoDecisionRecord(record),
  );
}
