import type {
  AnchorDriftReason,
  AnchorHashKind,
  AnchorResolverName,
  AnchorUnresolvedReason,
  RemoteAnchorState,
} from "../../anchor-resolver/index.js";
import type { KbAnchor } from "../../kb-record.schema.js";

/**
 * What the run did about an anchor it set out to write. `applied` is set only
 * after the record is persisted, so a report never claims a baseline the store
 * does not hold.
 */
export type AnchorUpdateOutcome = "applied" | "skipped" | "failed";

/** Why an intended write did not happen. */
export type AnchorUpdateReason = "frozen" | "write-failed" | "pinned-ref";

export type AnchorResolveResult = {
  file: string;
  symbol?: string;
  /** Set only for `side: "old"`: resolved at `ref`, never in the working tree. */
  side?: "old";
  /** `unstamped`: no hash yet, and nothing wrote one. */
  state: "stamped" | "unstamped" | "match" | "drifted" | "unresolved";
  storedHash?: string;
  currentHash?: string;
  /** What the compared hashes were taken over. */
  hashKind?: AnchorHashKind;
  /** `null` when the anchor recorded no `lines` — size unknown, not zero. */
  diffSize?: number | null;
  reason?: AnchorUnresolvedReason | AnchorDriftReason;
  resolver?: AnchorResolverName;
  /** Set only where a baseline write was due: the comparison is `state`. */
  outcome?: AnchorUpdateOutcome;
  outcomeReason?: AnchorUpdateReason;
  rebaselined?: boolean;
  /** Set only when the anchor was resolved against another repository. */
  repo?: string;
  remoteState?: RemoteAnchorState;
};

/** What one anchor was compared against, and what "current" is beside it. */
export type AnchorSource =
  | { ok: true; source: string; repo?: string; head?: string }
  | { ok: false; reason: AnchorUnresolvedReason; repo?: string };

/** Which write an anchor earned from the comparison. */
export type AnchorWriteKind = "stamp" | "rebaseline" | "refresh";

/**
 * One anchor's comparison and the write it earns. `finding` describes the code
 * as read; only `apply` turns a pending write into an outcome.
 */
export type AnchorPlan = {
  finding: AnchorResolveResult;
  /** What to persist: the anchor unchanged when `write` is absent. */
  anchor: KbAnchor;
  write?: AnchorWriteKind;
};
