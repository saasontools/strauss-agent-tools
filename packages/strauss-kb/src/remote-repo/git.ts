import { runGit } from "@saasontools/git-guard";
import {
  MAX_ANCHOR_FILE_BYTES,
  type AnchorUnresolvedReason,
} from "../anchor-resolver/model.js";

export type GitRun = {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** Set when the child died because its output passed the blob cap. */
  overflowed: boolean;
};

/**
 * One `git` invocation through git-guard — argv only, redirecting `GIT_*`
 * stripped, prompts off — because `repo`, `ref`, and `file` are bundle data.
 * A non-zero exit is a result, not a throw.
 */
export async function git(
  args: string[],
  options: { cwd?: string; timeoutMs?: number; maxBytes?: number } = {},
): Promise<GitRun> {
  const result = await runGit(args, {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    timeoutMs: options.timeoutMs ?? 30_000,
    maxBytes: options.maxBytes ?? MAX_ANCHOR_FILE_BYTES,
  });
  return {
    ok: result.ok,
    stdout: result.stdout,
    stderr: result.stderr,
    overflowed: !result.ok && result.reason === "too-large",
  };
}

/**
 * Which failure a git transport error was. Matched on message text because
 * git returns 128 for all of them; an unrecognised failure is unreachable,
 * the reason that never accuses the record of being wrong.
 */
export function transportReason(stderr: string): AnchorUnresolvedReason {
  const text = stderr.toLowerCase();
  if (
    text.includes("authentication failed") ||
    text.includes("permission denied") ||
    text.includes("could not read username") ||
    text.includes("403 forbidden") ||
    text.includes("access denied")
  ) {
    return "repo-unauthorized";
  }
  if (
    text.includes("couldn't find remote ref") ||
    text.includes("unadvertised object") ||
    text.includes("not our ref")
  ) {
    return "ref-not-found";
  }
  return "remote-unreachable";
}
