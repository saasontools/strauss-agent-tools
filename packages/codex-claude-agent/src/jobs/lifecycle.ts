import { RunnerError } from "../errors.js";
import { RunResultSchema, type JobRecord, type RunResult } from "../schema.js";
import { appendEvent } from "./events.js";
import { assertJobOwner } from "./ownership.js";
import { resolveJobPaths } from "./paths.js";
import {
  getProcessIdentity,
  processExists,
  terminateProcessTree,
} from "./processes.js";
import {
  readJob,
  transitionJob,
  updateJob,
  writeJobResult,
} from "./storage.js";

const LAUNCH_GRACE_MS = 10_000;

function retainedWorktreeWarning(job: JobRecord) {
  if (!job.worktree?.created || job.worktree.removed) return [];
  return [
    {
      code: "W_WORKTREE_RETAINED" as const,
      message: `Terminated run retained its worktree: ${job.worktree.path}`,
      hint: "Inspect it, then remove it with git worktree remove.",
    },
  ];
}

function terminalFailureResult(job: JobRecord, message: string): RunResult {
  const paths = resolveJobPaths(job.repoRoot, job.jobId);
  return RunResultSchema.parse({
    ok: false,
    jobId: job.jobId,
    cwd: job.request.cwd ?? job.repoRoot,
    worktree: job.worktree,
    usage: { turns: 0, durationMs: Date.now() - Date.parse(job.createdAt) },
    warnings: retainedWorktreeWarning(job),
    error: {
      code: "E_EXECUTION",
      message,
      hint: "Inspect the job log and start a new run if the worker exited unexpectedly.",
      retryable: false,
      attempts: 1,
    },
    artifacts: { resultPath: paths.resultPath, logPath: paths.logPath },
  });
}

export async function failJob(
  repoRoot: string,
  jobId: string,
  message: string,
  cause?: unknown,
): Promise<JobRecord> {
  const job = await readJob(repoRoot, jobId);
  if (!["queued", "running"].includes(job.state)) return job;
  const base = terminalFailureResult(job, message);
  const result = RunResultSchema.parse({
    ...base,
    error: {
      ...base.error,
      cause: cause instanceof Error ? cause.message : cause,
    },
  });
  const patch = {
    state: "failed" as const,
    unread: true,
    completedAt: new Date().toISOString(),
    pid: undefined,
    processIdentity: undefined,
    detachedProcessGroup: undefined,
  };
  let transition;
  try {
    transition = await transitionJob(
      repoRoot,
      jobId,
      patch,
      ["queued", "running"],
      async () => {
        await writeJobResult(repoRoot, result);
        await appendEvent(repoRoot, jobId, {
          type: "result",
          ts: new Date().toISOString(),
          jobId,
          seq: Number.MAX_SAFE_INTEGER,
          data: { ok: false, code: "E_EXECUTION", boundary: "worker" },
        });
      },
    );
  } catch (error) {
    await transitionJob(repoRoot, jobId, { ...patch, result }, [
      "queued",
      "running",
    ]);
    throw error;
  }
  return transition.job;
}

export async function reconcileJob(
  repoRoot: string,
  input: JobRecord | string,
  options: {
    getIdentity?: typeof getProcessIdentity;
  } = {},
): Promise<JobRecord> {
  const job =
    typeof input === "string" ? await readJob(repoRoot, input) : input;
  if (!["queued", "running"].includes(job.state)) return job;
  const ageMs = Date.now() - Date.parse(job.createdAt);
  const alive = job.pid !== undefined && processExists(job.pid);
  const identity =
    alive && job.pid
      ? await (options.getIdentity ?? getProcessIdentity)(job.pid)
      : undefined;
  if (alive && (job.processIdentity === undefined || identity === undefined)) {
    return job;
  }
  const sameProcess =
    alive &&
    job.processIdentity !== undefined &&
    identity === job.processIdentity;
  if (
    sameProcess ||
    (job.state === "queued" && job.pid === undefined && ageMs < LAUNCH_GRACE_MS)
  )
    return job;
  const result = terminalFailureResult(
    job,
    alive
      ? `Claude background worker identity no longer matches job ${job.jobId}.`
      : `Claude background worker exited before completing job ${job.jobId}.`,
  );
  const patch = {
    state: "failed" as const,
    unread: true,
    completedAt: new Date().toISOString(),
    pid: undefined,
    processIdentity: undefined,
    detachedProcessGroup: undefined,
  };
  let transition;
  try {
    transition = await transitionJob(
      repoRoot,
      job.jobId,
      patch,
      ["queued", "running"],
      async () => writeJobResult(repoRoot, result),
    );
  } catch (error) {
    await transitionJob(repoRoot, job.jobId, { ...patch, result }, [
      "queued",
      "running",
    ]);
    throw error;
  }
  return transition.job;
}

export async function cancelJob(
  repoRoot: string,
  jobId: string,
): Promise<JobRecord> {
  const stored = await readJob(repoRoot, jobId);
  assertJobOwner(stored);
  const job = await reconcileJob(repoRoot, stored);
  if (!["queued", "running"].includes(job.state)) return job;
  if (job.pid && job.processIdentity) {
    if (job.dedicatedProcess !== true) {
      throw new RunnerError(
        "E_EXECUTION",
        `Job ${jobId} is running inside a shared host process and cannot be cancelled by signal.`,
        {
          hint: "Cancel it through the programmatic caller or wait for its configured timeout.",
        },
      );
    }
    const currentIdentity = await getProcessIdentity(job.pid);
    if (currentIdentity === undefined) {
      throw new RunnerError(
        "E_EXECUTION",
        `Unable to verify the running process for job ${jobId}; retry cancellation.`,
      );
    }
    if (currentIdentity !== job.processIdentity) {
      return reconcileJob(repoRoot, job);
    }
    try {
      await terminateProcessTree(job.pid, job.detachedProcessGroup === true);
    } catch (error) {
      throw new RunnerError("E_EXECUTION", `Unable to cancel job ${jobId}.`, {
        cause: error,
      });
    }
  } else if (job.state === "running") {
    throw new RunnerError(
      "E_EXECUTION",
      `Refusing to signal running job ${jobId} without a verified process identity.`,
    );
  }
  const paths = resolveJobPaths(repoRoot, jobId);
  const result = RunResultSchema.parse({
    ok: false,
    jobId,
    cwd: job.request.cwd ?? repoRoot,
    worktree: job.worktree,
    usage: { turns: 0, durationMs: Date.now() - Date.parse(job.createdAt) },
    warnings: retainedWorktreeWarning(job),
    error: {
      code: "E_CANCELLED",
      message: "Claude job was cancelled.",
      hint: "Start a new run when you are ready to continue.",
      retryable: false,
      attempts: 1,
    },
    artifacts: { resultPath: paths.resultPath, logPath: paths.logPath },
  });
  const patch = {
    state: "cancelled" as const,
    completedAt: new Date().toISOString(),
    unread: true,
    pid: undefined,
    processIdentity: undefined,
    detachedProcessGroup: undefined,
  };
  let transition;
  try {
    transition = await transitionJob(
      repoRoot,
      jobId,
      patch,
      ["queued", "running"],
      async () => writeJobResult(repoRoot, result),
    );
  } catch (error) {
    await transitionJob(repoRoot, jobId, { ...patch, result }, [
      "queued",
      "running",
    ]);
    throw error;
  }
  return transition.job;
}

export async function markResultRead(
  repoRoot: string,
  jobId: string,
): Promise<JobRecord> {
  return updateJob(repoRoot, jobId, { unread: false });
}
