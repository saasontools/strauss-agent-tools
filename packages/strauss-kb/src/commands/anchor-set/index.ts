/**
 * `anchor-set` — setting a record's pointers after a refactor someone read.
 * The rule it enforces lives in `anchors/`, which a record's first write shares.
 */
export { anchorSetCommand } from "./command.js";
export {
  anchorSetInputSchema,
  type AnchorSetInput,
  type KbAnchorSetResult,
} from "./model.js";
