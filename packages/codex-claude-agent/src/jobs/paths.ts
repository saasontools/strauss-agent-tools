import { randomBytes } from "node:crypto";
import path from "node:path";

import { RunnerError } from "../errors.js";
import { repositoryStateDirectory } from "../state.js";

export interface JobPaths {
  jobsDir: string;
  recordPath: string;
  resultPath: string;
  logPath: string;
  requestPath: string;
}

export function generateJobId(): string {
  return `claude-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

export function resolveJobPaths(repoRoot: string, jobId: string): JobPaths {
  if (!/^[A-Za-z0-9._-]+$/.test(jobId)) {
    throw new RunnerError("E_INVALID_REQUEST", `Invalid job ID: ${jobId}`);
  }
  const jobsDir = path.join(repositoryStateDirectory(repoRoot), "jobs");
  return {
    jobsDir,
    recordPath: path.join(jobsDir, `${jobId}.json`),
    resultPath: path.join(jobsDir, `${jobId}.result.md`),
    logPath: path.join(jobsDir, `${jobId}.log.jsonl`),
    requestPath: path.join(jobsDir, `${jobId}.request.json`),
  };
}
