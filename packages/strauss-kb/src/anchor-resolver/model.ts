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
export type AnchorResolverName = "tree-sitter" | "regex" | "span";

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
  /**
   * The span's normalised token stream — comments dropped, runs of whitespace
   * collapsed — or `null` when this resolver cannot parse the text.
   *
   * Only a resolver that understands the language can offer one, which is why
   * it is optional: a text heuristic normalising by guess would call two
   * different programs equal.
   */
  normalize?(text: string, file?: string): string | null;
}

/** A resolved span, and which resolver produced it. */
export type AnchorResolution =
  | {
      ok: true;
      span: ResolvedSymbol;
      resolver?: AnchorResolverName;
      /** The span's token stream, when the resolver that spanned it can parse. */
      normalized?: string;
    }
  | { ok: false; reason: AnchorUnresolvedReason };

/** Why an anchor could not be compared. Never an error — always a finding. */
export type AnchorUnresolvedReason =
  | "file-missing"
  | "symbol-not-found"
  /** More than one definition carries the name, and guessing is not allowed. */
  | "symbol-ambiguous"
  /** The anchor's `span` runs past the end of the file it names. */
  | "span-out-of-range"
  /** `side: "old"` with no usable `ref`, or no such path at the rev. */
  | "ref-unreadable"
  /** The `ref` is not in this clone — a shallow checkout, not deleted code. */
  | "ref-unavailable"
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

/** What `hash` was taken over. Absent on an anchor means `raw`. */
export type AnchorHashKind = "raw" | "ast";

/**
 * How an anchor's code changed, once the bytes are known to differ.
 *
 * The classes a machine can settle, so a reader only sees the ones it cannot:
 * `moved` and `cosmetic` are answered and closed, `gone` and `changed` are
 * handed on. Deliberately shallow — whether the record's *claim* still holds
 * is a reading, and no hash can stand in for one.
 */
export const KB_DRIFT_CLASSES = [
  "moved",
  "cosmetic",
  "gone",
  "changed",
] as const;

export type KbDriftClass = (typeof KB_DRIFT_CLASSES)[number];

/** Where a `moved` anchor's stored hash turned up. */
export type KbDriftMovedTo = {
  file: string;
  symbol?: string;
  startLine: number;
  endLine: number;
};

export type KbAnchorDriftEntry = {
  file: string;
  symbol?: string;
  /** Set only for `side: "old"`: read at `ref`, never from the working tree. */
  side?: "old";
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
  /** What the compared hashes were taken over. */
  hashKind?: AnchorHashKind;
  /**
   * Provisional: `gone` or `changed`, the two a hash comparison alone can
   * settle. `moved` and `cosmetic` cost a repository search and a git read, so
   * `classifyDrift` refines this on the reassessment path rather than on every
   * `load`.
   */
  class?: KbDriftClass;
  /** Set by `classifyDrift` when the class is `moved`. */
  movedTo?: KbDriftMovedTo;
};

export type AnchorRead =
  { ok: true; source: string } | { ok: false; reason: AnchorUnresolvedReason };

export type AnchorFileReader = (file: string) => Promise<AnchorRead>;
