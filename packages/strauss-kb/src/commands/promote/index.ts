/**
 * `promote` — lifting what a review base settled into the base that outlives
 * it. Importers point here, not at the files behind it.
 */
export { promoteCommand, renderPromote } from "./command.js";
export { carry, isReviewTag, PROMOTION_SOURCE_ID } from "./carry.js";
export { promoteCandidates } from "./candidates.js";
export {
  promoteInputSchema,
  type KbDroppedLink,
  type KbPromoteCandidate,
  type KbPromoteResult,
  type KbPromotedRecord,
} from "./model.js";
