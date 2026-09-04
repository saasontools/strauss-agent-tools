import type {
  AnchorDriftReason,
  AnchorUnresolvedReason,
} from "../anchor-resolver/model.js";

/**
 * A foreign anchor's file at one rev. `ref` absent means the remote's default
 * branch — the "current" side of a ref-pinned comparison.
 */
export type RemoteWant = { repo: string; ref?: string; file: string };

export type RemoteRead =
  { ok: true; source: string } | { ok: false; reason: AnchorUnresolvedReason };

export type RemoteOptions = {
  /** Cache only: no `fetch`, no `ls-remote`. */
  offline?: boolean;
  cacheDir?: string;
  fetchTimeoutMs?: number;
  /** Repositories worked on at once; fetches within one repo stay serial. */
  concurrency?: number;
};

/** Reasons that mean "not checked", as opposed to evidence that moved. */
export const UNCHECKED_REASONS: readonly AnchorUnresolvedReason[] = [
  "remote-unreachable",
  "repo-unauthorized",
  "default-branch-unknown",
];

export function isUncheckedReason(
  reason: AnchorUnresolvedReason | AnchorDriftReason | undefined,
): boolean {
  return (
    reason !== undefined &&
    UNCHECKED_REASONS.includes(reason as AnchorUnresolvedReason)
  );
}

/** One key per (repo, rev, file); `ref` absent is the default branch. */
export function wantKey(
  repo: string,
  ref: string | undefined,
  file: string,
): string {
  return `${repo}\u0000${ref ?? ""}\u0000${file}`;
}
