/**
 * The vocabulary anchor resolution is reported in.
 *
 * Every failure is a finding with a reason, never a throw: a record pointing
 * at code that moved is information, not a broken run.
 */

export type ResolvedSymbol = {
  text: string;
  /** 1-based, inclusive. */
  startLine: number;
  endLine: number;
};

/** Which resolver produced a span. Stamped on the anchor. */
export type AnchorResolverName = "tree-sitter" | "regex";

/**
 * A resolver's verdict. `abstain` means "not my language" and passes the
 * symbol down the chain; an `unresolved` verdict ends it, because a resolver
 * that parsed the file and found no definition has answered the question.
 */
export type ResolverAttempt =
  | { kind: "resolved"; span: ResolvedSymbol }
  | {
      kind: "unresolved";
      reason: "symbol-not-found" | "symbol-ambiguous" | "resolver-unavailable";
    }
  | { kind: "abstain" };

export interface AnchorResolver {
  name: string;
  /** Loads whatever these files need, before any `resolve` call. Optional. */
  prepare?(files: readonly string[]): Promise<void>;
  /** The richer verdict the chain uses; defaults to `resolve`. */
  attempt?(source: string, symbol: string, file?: string): ResolverAttempt;
  resolve(source: string, symbol: string, file?: string): ResolvedSymbol | null;
}

/** A resolved span, and which resolver produced it. */
export type AnchorResolution =
  | { ok: true; span: ResolvedSymbol; resolver?: AnchorResolverName }
  | { ok: false; reason: AnchorUnresolvedReason };

/** Why an anchor could not be compared. Never an error — always a finding. */
export type AnchorUnresolvedReason =
  | "file-missing"
  | "symbol-not-found"
  /** More than one definition carries the name, and guessing is not allowed. */
  | "symbol-ambiguous"
  /** The extension has a grammar, but it would not load. Never a throw. */
  | "resolver-unavailable"
  | "outside-repo"
  | "file-too-large"
  | "file-unreadable"
  /** The remote could not be fetched, or `--offline` found nothing cached. */
  | "remote-unreachable"
  /** The anchor's `ref` is not on the remote any more. */
  | "ref-not-found"
  | "repo-unauthorized"
  /** No default branch, so there is no "current" to compare against. */
  | "default-branch-unknown"
  /** The anchor's `ref` is not a name git may safely be handed. */
  | "ref-invalid"
  /** The anchor's `repo` is not a remote we will fetch from. */
  | "repo-invalid";

/**
 * A hash that changed because a more precise resolver took over, not because
 * the code did. Reported as drift so nothing is restamped silently, and
 * accepted by `--rebaseline` like any other.
 */
export type AnchorDriftReason = "resolver-changed";

/**
 * How a ref-pinned foreign anchor stands. `drifted-on-default` is the one a
 * working-tree anchor has no equivalent of: the evidence is still true at the
 * commit it was taken from, and the code has moved since.
 */
export type RemoteAnchorState =
  "matches-ref" | "drifted-from-ref" | "drifted-on-default";

/** Big enough for any hand-written source file, small enough to read eagerly. */
export const MAX_ANCHOR_FILE_BYTES = 1_048_576;

export type KbAnchorDriftEntry = {
  file: string;
  symbol?: string;
  state: "match" | "drifted" | "unresolved";
  storedHash: string;
  currentHash?: string;
  /** `null` when the anchor recorded no `lines` — size unknown, not zero. */
  diffSize: number | null;
  reason?: AnchorUnresolvedReason | AnchorDriftReason;
  /** Which resolver produced `currentHash`. Absent for a whole-file anchor. */
  resolver?: AnchorResolverName;
  /** Set only when the anchor was resolved against another repository. */
  repo?: string;
  remoteState?: RemoteAnchorState;
};

export type AnchorRead =
  { ok: true; source: string } | { ok: false; reason: AnchorUnresolvedReason };

export type AnchorFileReader = (file: string) => Promise<AnchorRead>;
