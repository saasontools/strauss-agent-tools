/**
 * `anchor-set` — setting a record's pointers after a refactor someone read.
 * Importers point here, not at the files behind it.
 */
export { anchorSetCommand } from "./command.js";
export {
  KbAnchorBaselineError,
  KbAnchorDropsBaselineError,
  KbAnchorSetDuplicateError,
} from "./errors.js";
export {
  anchorSetInputSchema,
  type AnchorSetInput,
  type KbAnchorChange,
  type KbAnchorSetResult,
} from "./model.js";
export { applyAnchorSet, locatorOf, type KbAnchorSetOutcome } from "./apply.js";
