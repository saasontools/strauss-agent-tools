import { execFile } from "node:child_process";
import { gitEnv } from "./env.js";

/** `failed` is git's own non-zero exit; the other three are the run itself. */
export type GitFailure = "failed" | "too-large" | "timeout" | "git-missing";

export type GitRun =
  | { ok: true; stdout: string; stderr: string }
  | {
      ok: false;
      reason: GitFailure;
      stdout: string;
      stderr: string;
      /** git's exit status, when it ran and exited non-zero. */
      exitCode?: number;
    };

export type GitOptions = {
  cwd?: string;
  timeoutMs?: number;
  /** Past this much output the child is killed and the run is `too-large`. */
  maxBytes?: number;
  /** Written to stdin, which is closed either way. */
  input?: string;
  /** Added to the child's environment after `gitEnv`. */
  env?: Readonly<Record<string, string>>;
};

export const DEFAULT_TIMEOUT_MS = 5_000;
export const DEFAULT_MAX_BYTES = 1_048_576;

/**
 * One git invocation: argv only, never a shell, environment from `gitEnv`. A
 * non-zero exit is a result, not a throw. Callers put every positional that
 * derives from untrusted data after `--end-of-options` or `--`.
 */
export function runGit(
  args: readonly string[],
  options: GitOptions = {},
): Promise<GitRun> {
  return new Promise((resolve) => {
    const child = execFile(
      "git",
      [...args],
      {
        ...(options.cwd ? { cwd: options.cwd } : {}),
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: options.maxBytes ?? DEFAULT_MAX_BYTES,
        encoding: "utf8",
        windowsHide: true,
        env: { ...gitEnv(), ...options.env },
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ ok: true, stdout, stderr });
          return;
        }
        const { code } = error as { code?: unknown };
        resolve({
          ok: false,
          reason: failureOf(error),
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          ...(typeof code === "number" ? { exitCode: code } : {}),
        });
      },
    );
    // A child that never started, or exited before reading, closes stdin under
    // the write; that is the run's failure, already reported above.
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(options.input ?? "");
  });
}

/** A killed child is over the cap before it is over time: the cap kills too. */
function failureOf(error: unknown): GitFailure {
  const { code, killed } = error as { code?: unknown; killed?: boolean };
  if (code === "ENOENT") return "git-missing";
  if (code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return "too-large";
  if (killed === true) return "timeout";
  return "failed";
}
