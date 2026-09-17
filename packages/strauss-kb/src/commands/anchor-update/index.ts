/**
 * `anchor-update` — moving a record's pointers after a refactor someone read.
 * Importers point here, not at the files behind it.
 */
export { anchorUpdateCommand } from "./command.js";
export {
  KbAnchorBoundaryError,
  KbAnchorPatchConflictError,
  KbAnchorPatchEmptiesRecordError,
  KbAnchorPatchEmptyError,
  KbAnchorSelectorError,
} from "./errors.js";
export {
  anchorPatchInputSchema,
  type AnchorPatchInput,
  type KbAnchorChange,
  type KbAnchorPatchResult,
  type KbAnchorUpdateResult,
} from "./model.js";
export { applyAnchorPatch, locatorOf } from "./patch.js";
