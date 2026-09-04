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

export interface AnchorResolver {
  name: string;
  resolve(source: string, symbol: string): ResolvedSymbol | null;
}

/** Why an anchor could not be compared. Never an error — always a finding. */
export type AnchorUnresolvedReason =
  | "file-missing"
  | "symbol-not-found"
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
  reason?: AnchorUnresolvedReason;
  /** Set only when the anchor was resolved against another repository. */
  repo?: string;
  remoteState?: RemoteAnchorState;
};

export type AnchorRead =
  { ok: true; source: string } | { ok: false; reason: AnchorUnresolvedReason };

export type AnchorFileReader = (file: string) => Promise<AnchorRead>;
