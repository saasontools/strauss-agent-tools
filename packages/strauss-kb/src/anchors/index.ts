/**
 * What anchors a record may hold, given what it holds now. One home for the
 * rule, because a record's first write and a later reviewed set have to agree
 * about where a baseline comes from.
 */
export {
  applyAnchorSet,
  locatorOf,
  type KbAnchorChange,
  type KbAnchorSetOutcome,
} from "./apply.js";
export { KbAnchorSetDuplicateError, locatorText } from "./errors.js";
