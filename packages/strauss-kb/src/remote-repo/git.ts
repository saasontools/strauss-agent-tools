import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  MAX_ANCHOR_FILE_BYTES,
  type AnchorUnresolvedReason,
} from "../anchor-resolver/model.js";

const execFileAsync = promisify(execFile);

export type GitRun = {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** Set when the child died because its output passed the blob cap. */
  overflowed: boolean;
};

/**
 * One `git` invocation, argv only — never a shell, because `repo`, `ref`, and
 * `file` are bundle data. A non-zero exit is a result, not a throw.
 */
export async function git(
  args: string[],
  options: { cwd?: string; timeoutMs?: number; maxBytes?: number } = {},
): Promise<GitRun> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      ...(options.cwd ? { cwd: options.cwd } : {}),
      timeout: options.timeoutMs ?? 30_000,
      maxBuffer: options.maxBytes ?? MAX_ANCHOR_FILE_BYTES,
      encoding: "utf8",
      windowsHide: true,
      // A credential helper that decides to prompt would otherwise block the
      // run forever on a repository the caller has no access to.
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return { ok: true, stdout, stderr, overflowed: false };
  } catch (error) {
    const failure = error as {
      stdout?: string;
      stderr?: string;
      code?: string | number;
    };
    return {
      ok: false,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      overflowed: failure.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
    };
  }
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
