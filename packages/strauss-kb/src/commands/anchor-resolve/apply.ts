import { z } from "zod";
import { BaseError } from "../../errors.js";
import { assertBaseNotFrozen, KbBaseFrozenError } from "../../kb-pins/index.js";
import type { KbStore } from "../../kb-store.js";
import type {
  AnchorPlan,
  AnchorResolveResult,
  AnchorUpdateReason,
} from "./model.js";

export type ApplyTarget = {
  store: KbStore;
  actor: string;
  bundlePath: string;
  conceptId: string;
  /** What the freeze check found, before anything was planned. */
  frozen: boolean;
};

export type AppliedPlan = {
  results: AnchorResolveResult[];
  /** The store's message when it refused the write. */
  error?: string;
};

/**
 * Whether the base refuses writes. Asked before the plan is built, so a run
 * plans only what the base would accept — a freeze is policy, like `--check`,
 * not a failure discovered halfway.
 */
export async function baseFrozen(
  cwd: string,
  bundlePath: string,
): Promise<boolean> {
  try {
    await assertBaseNotFrozen(cwd, bundlePath);
    return false;
  } catch (caught) {
    if (!(caught instanceof KbBaseFrozenError)) throw caught;
    return true;
  }
}

/**
 * Persists the plan's writes, then says per anchor what became of each. One
 * record, one write: every pending anchor is applied together or none is, so
 * an outcome of `applied` is a hash the base now holds.
 */
export async function applyPlan(
  plans: readonly AnchorPlan[],
  target: ApplyTarget,
): Promise<AppliedPlan> {
  if (!plans.some((plan) => plan.write)) {
    return { results: plans.map((plan) => plan.finding) };
  }

  // Frozen bases refuse writes, not reads: pure drift reporting is legitimate
  // on a concluded base, so the report is computed either way and the freeze
  // only costs the mutation. Reported rather than thrown — a caller asking a
  // concluded base whether its code moved deserves the answer.
  let failure: AnchorUpdateReason | undefined = target.frozen
    ? "frozen"
    : undefined;
  let error: string | undefined;
  if (!failure) {
    try {
      await target.store.updateAnchors(
        target.bundlePath,
        target.conceptId,
        plans.map((plan) => plan.anchor),
        target.actor,
      );
    } catch (caught) {
      // A typed error is the caller's to act on — a write conflict says this
      // whole comparison was computed from a record that has since moved, a
      // refused actor says the call was wrong, a schema error says this
      // command built the anchor badly — so it propagates, and MCP still
      // marks the call an error. What is left is the environment failing,
      // which the report can carry.
      if (caught instanceof BaseError || caught instanceof z.ZodError) {
        throw caught;
      }
      failure = "write-failed";
      error = clamp(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return {
    results: plans.map((plan) => settle(plan, failure)),
    ...(error ? { error } : {}),
  };
}

/** The finding plus what the write did, for the anchors a write was due on. */
function settle(
  plan: AnchorPlan,
  failure: AnchorUpdateReason | undefined,
): AnchorResolveResult {
  if (!plan.write) return plan.finding;
  // A refused write says so whatever it was for. A `resolved_at` refresh that
  // landed moves no baseline, so it stays quiet.
  if (failure) {
    return { ...plan.finding, outcome: "failed", outcomeReason: failure };
  }
  if (plan.write === "refresh") return plan.finding;
  return plan.write === "stamp"
    ? { ...plan.finding, state: "stamped", outcome: "applied" }
    : { ...plan.finding, outcome: "applied", rebaselined: true };
}

/** A store message goes in a report a person reads; its length is not news. */
function clamp(message: string): string {
  const line = message.split("\n")[0] ?? "";
  return line.length > 200 ? `${line.slice(0, 199)}…` : line;
}
