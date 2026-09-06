/**
 * Drift reassessment: what a changed hash means, and what a reader needs to
 * decide about it.
 *
 * `classify` answers the mechanical half — moved, cosmetic, gone, changed —
 * and `packet` assembles what is left into something judgeable. `git` and
 * `diff` are the two capabilities both need; neither is exported for its own
 * sake.
 */
export {
  classifyDrift,
  type ClassifiedAnchor,
  type ClassifyOptions,
} from "./classify.js";
export {
  diffBudget,
  unifiedDiff,
  MAX_ANCHOR_DIFF_LINES,
  PACKET_DIFF_LINE_BUDGET,
  type UnifiedDiff,
} from "./diff.js";
export {
  listRepoFiles,
  readOldSource,
  type OldSource,
  type OldSourceOrigin,
} from "./git.js";
export {
  movedSearch,
  MAX_MOVED_SEARCH_FILES,
  type MovedSearch,
} from "./moved.js";
export {
  reassessPacket,
  type KbReassessAnchor,
  type KbReassessDefault,
  type KbReassessDiff,
  type KbReassessPacket,
  type PacketOptions,
} from "./packet.js";
