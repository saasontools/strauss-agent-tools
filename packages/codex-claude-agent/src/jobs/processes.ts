import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { RunnerError } from "../errors.js";
import { readFileNoFollow } from "../utils/secure-files.js";

const execFileAsync = promisify(execFile);
const PROCESS_PROBE_TIMEOUT_MS = 5_000;
/**
 * Windows has no cheap start-time source: the probe pays a PowerShell start
 * plus a CIM query, which on a loaded CI runner has been measured past the
 * 5s budget that suffices everywhere else. A run that cannot identify its own
 * process fails outright, so this one gets room and a second attempt.
 */
const WINDOWS_PROBE_TIMEOUT_MS = 20_000;
const TERMINATION_GRACE_MS = 2_000;

export interface ProcessIdentityProbe {
  identity?: string;
  /** Why the probe came back empty. For error messages, never for control flow. */
  reason?: string;
}

const describe = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/**
 * The identity of a process, and — when there is none — why.
 *
 * `getProcessIdentity` keeps the plain signature its six callers use. This
 * variant exists because a failure here aborts a run with `E_EXECUTION`, and
 * a swallowed cause makes that unfixable from a CI log: the reason a Windows
 * probe came back empty is the whole diagnosis.
 */
export async function probeProcessIdentity(
  pid: number,
  signal?: AbortSignal,
): Promise<ProcessIdentityProbe> {
  if (signal?.aborted) throw signal.reason;
  if (process.platform === "linux") {
    try {
      const identity = parseLinuxProcessStartTime(
        await readFileNoFollow(`/proc/${pid}/stat`),
      );
      if (signal?.aborted) throw signal.reason;
      return identity ? { identity } : { reason: "unparsable /proc stat" };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      return { reason: describe(error) };
    }
  }
  if (process.platform === "win32") {
    let reason = "";
    // Twice: the first attempt on a busy runner is the one that times out.
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const { stdout } = await execFileAsync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CreationDate.ToUniversalTime().ToString('o')`,
          ],
          { timeout: WINDOWS_PROBE_TIMEOUT_MS, signal },
        );
        const identity = stdout.trim();
        if (identity) return { identity };
        reason = "powershell returned no creation date";
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        reason = `${describe(error)} (attempt ${attempt})`;
      }
    }
    return { reason };
  }
  try {
    const { stdout } = await execFileAsync(
      "ps",
      ["-o", "lstart=", "-p", String(pid)],
      { timeout: PROCESS_PROBE_TIMEOUT_MS, signal },
    );
    const identity = stdout.trim();
    return identity ? { identity } : { reason: "ps returned no start time" };
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    return { reason: describe(error) };
  }
}

export async function getProcessIdentity(
  pid: number,
  signal?: AbortSignal,
): Promise<string | undefined> {
  return (await probeProcessIdentity(pid, signal)).identity;
}

export function parseLinuxProcessStartTime(
  statLine: string,
): string | undefined {
  const commandEnd = statLine.lastIndexOf(")");
  if (commandEnd < 0) return undefined;
  const fieldsFromState = statLine
    .slice(commandEnd + 1)
    .trim()
    .split(/\s+/);
  return fieldsFromState[19];
}

export function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function processGroupExists(pid: number): boolean {
  return processExists(process.platform === "win32" ? pid : -pid);
}

async function waitForProcessGroupExit(
  pid: number,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (processGroupExists(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !processGroupExists(pid);
}

export async function terminateProcessTree(
  pid: number,
  detachedProcessGroup = true,
): Promise<void> {
  const targetExists = () =>
    detachedProcessGroup ? processGroupExists(pid) : processExists(pid);
  if (!targetExists()) return;
  if (process.platform === "win32") {
    try {
      await execFileAsync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
        timeout: PROCESS_PROBE_TIMEOUT_MS,
      });
    } catch (error) {
      if (targetExists()) {
        throw new RunnerError(
          "E_EXECUTION",
          `Unable to terminate process tree ${pid}.`,
          { cause: error },
        );
      }
    }
    if (!(await waitForProcessGroupExit(pid, TERMINATION_GRACE_MS))) {
      throw new RunnerError(
        "E_EXECUTION",
        `Process tree ${pid} did not exit after cancellation.`,
      );
    }
    return;
  }

  try {
    process.kill(detachedProcessGroup ? -pid : pid, "SIGTERM");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      throw new RunnerError(
        "E_EXECUTION",
        `Unable to terminate process group ${pid}.`,
        { cause: error },
      );
    }
  }
  const waitForTargetExit = detachedProcessGroup
    ? waitForProcessGroupExit
    : async (targetPid: number, timeoutMs: number) => {
        const deadline = Date.now() + timeoutMs;
        while (processExists(targetPid) && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return !processExists(targetPid);
      };
  if (await waitForTargetExit(pid, TERMINATION_GRACE_MS)) return;
  try {
    process.kill(detachedProcessGroup ? -pid : pid, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      throw new RunnerError(
        "E_EXECUTION",
        `Unable to force-stop process group ${pid}.`,
        { cause: error },
      );
    }
  }
  if (!(await waitForTargetExit(pid, TERMINATION_GRACE_MS))) {
    throw new RunnerError(
      "E_EXECUTION",
      `Process group ${pid} did not exit after cancellation.`,
    );
  }
}
