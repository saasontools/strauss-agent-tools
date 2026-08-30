import { constants } from "node:fs";
import { lstat, mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";

import { RunnerError } from "../errors.js";
import { renderMarkdown } from "../render.js";
import {
  JobRecordSchema,
  RunResultSchema,
  type JobRecord,
  type RunRequest,
  type RunResult,
} from "../schema.js";
import {
  readFileNoFollow,
  writeFileAtomically,
} from "../utils/secure-files.js";
import { acquireJobLock } from "./lock.js";
import { ownerSessionId } from "./ownership.js";
import { generateJobId, resolveJobPaths } from "./paths.js";

export async function ensureSecureDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const normalized = path.resolve(directory);
  const stateDirectory = path.dirname(normalized);
  const stateBase = path.dirname(path.dirname(stateDirectory));
  const candidates = [stateBase, stateDirectory, normalized];
  for (const candidate of new Set(candidates)) {
    const details = await lstat(candidate);
    if (!details.isDirectory() || details.isSymbolicLink()) {
      throw new RunnerError(
        "E_EXECUTION",
        `Refusing unsafe job artifact directory: ${candidate}`,
      );
    }
  }
}

async function writeJsonAtomically(
  filePath: string,
  value: unknown,
): Promise<void> {
  await ensureSecureDirectory(path.dirname(filePath));
  await writeFileAtomically(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function createJob(
  repoRoot: string,
  request: RunRequest,
  jobId = generateJobId(),
): Promise<JobRecord> {
  const now = new Date().toISOString();
  const record = JobRecordSchema.parse({
    version: 1,
    jobId,
    state: "queued",
    request,
    repoRoot,
    ownerSessionId: ownerSessionId(),
    unread: false,
    createdAt: now,
    updatedAt: now,
    tags: request.tags,
  });
  const paths = resolveJobPaths(repoRoot, jobId);
  await ensureSecureDirectory(paths.jobsDir);
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(
      paths.recordPath,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      throw new RunnerError(
        "E_INVALID_REQUEST",
        `Job already exists: ${jobId}`,
        { cause: error },
      );
    }
    throw new RunnerError("E_EXECUTION", `Unable to create job ${jobId}.`, {
      cause: error,
    });
  }
  try {
    await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`);
    await handle.sync();
    await handle.close();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(paths.recordPath).catch(() => undefined);
    throw new RunnerError("E_EXECUTION", `Unable to write job ${jobId}.`, {
      cause: error,
    });
  }
  return record;
}

export async function readJob(
  repoRoot: string,
  jobId: string,
): Promise<JobRecord> {
  const paths = resolveJobPaths(repoRoot, jobId);
  try {
    return JobRecordSchema.parse(
      JSON.parse(await readFileNoFollow(paths.recordPath)),
    );
  } catch (error) {
    throw new RunnerError(
      "E_INVALID_REQUEST",
      `Unknown or invalid job: ${jobId}`,
      { cause: error },
    );
  }
}

export interface JobTransition {
  job: JobRecord;
  applied: boolean;
}

export async function transitionJob(
  repoRoot: string,
  jobId: string,
  patch: Partial<Omit<JobRecord, "jobId" | "repoRoot" | "request" | "version">>,
  expected?: JobRecord["state"][],
  beforeCommit?: (updated: JobRecord) => Promise<void>,
): Promise<JobTransition> {
  const paths = resolveJobPaths(repoRoot, jobId);
  const lockPath = `${paths.recordPath}.lock`;
  const release = await acquireJobLock(lockPath, jobId);
  try {
    const current = await readJob(repoRoot, jobId);
    if (expected && !expected.includes(current.state)) {
      return { job: current, applied: false };
    }
    const updated = JobRecordSchema.parse({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    await beforeCommit?.(updated);
    await writeJsonAtomically(paths.recordPath, updated);
    return { job: updated, applied: true };
  } finally {
    await release();
  }
}

export async function updateJob(
  repoRoot: string,
  jobId: string,
  patch: Partial<Omit<JobRecord, "jobId" | "repoRoot" | "request" | "version">>,
  expected?: JobRecord["state"][],
): Promise<JobRecord> {
  return (await transitionJob(repoRoot, jobId, patch, expected)).job;
}

export async function writeJobResult(
  repoRoot: string,
  result: RunResult,
): Promise<void> {
  const parsed = RunResultSchema.parse(result);
  const { resultPath } = resolveJobPaths(repoRoot, parsed.jobId);
  try {
    await ensureSecureDirectory(path.dirname(resultPath));
    await writeFileAtomically(resultPath, renderMarkdown(parsed));
  } catch (error) {
    throw new RunnerError(
      "E_EXECUTION",
      `Unable to persist result for job ${parsed.jobId}.`,
      { cause: error },
    );
  }
}

export async function writeJobRequest(
  repoRoot: string,
  jobId: string,
  request: RunRequest,
): Promise<void> {
  const { requestPath } = resolveJobPaths(repoRoot, jobId);
  await writeJsonAtomically(requestPath, request);
}
