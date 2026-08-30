import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { RunnerError } from "../errors.js";
import { readFileNoFollow } from "../utils/secure-files.js";

const execFileAsync = promisify(execFile);
const PROCESS_PROBE_TIMEOUT_MS = 5_000;
const TERMINATION_GRACE_MS = 2_000;

export async function getProcessIdentity(
  pid: number,
  signal?: AbortSignal,
): Promise<string | undefined> {
  if (signal?.aborted) throw signal.reason;
  if (process.platform === "linux") {
    try {
      const identity = parseLinuxProcessStartTime(
        await readFileNoFollow(`/proc/${pid}/stat`),
      );
      if (signal?.aborted) throw signal.reason;
      return identity;
    } catch {
      if (signal?.aborted) throw signal.reason;
      return undefined;
    }
  }
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CreationDate.ToUniversalTime().ToString('o')`,
        ],
        { timeout: PROCESS_PROBE_TIMEOUT_MS, signal },
      );
      return stdout.trim();
    } catch {
      if (signal?.aborted) throw signal.reason;
      return undefined;
    }
  }
  try {
    const { stdout } = await execFileAsync(
      "ps",
      ["-o", "lstart=", "-p", String(pid)],
      { timeout: PROCESS_PROBE_TIMEOUT_MS, signal },
    );
    return stdout.trim() || undefined;
  } catch {
    if (signal?.aborted) throw signal.reason;
    return undefined;
  }
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
