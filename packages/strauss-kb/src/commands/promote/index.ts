/**
 * `promote` — copying records from one base into another: a scratchpad into the
 * base a human reviews, or that into the base that outlives the pull request.
 * Importers point here, not at the files behind it.
 */
export { promoteCommand, renderPromote } from "./command.js";
export { carry, isReviewTag, PROMOTION_SOURCE_ID } from "./carry.js";
export { humanSettled } from "./settled.js";
export {
  CARRIED_FIELDS,
  CONFLICT_POLICIES,
  promoteInputSchema,
  type KbCarriedField,
  type KbConflictPolicy,
  type KbDroppedLink,
  type KbPromoteResult,
  type KbPromotedRecord,
  type KbSkippedRecord,
} from "./model.js";
