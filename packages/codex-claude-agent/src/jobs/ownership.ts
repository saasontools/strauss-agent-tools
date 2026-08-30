import { RunnerError } from "../errors.js";
import type { JobRecord } from "../schema.js";

export function ownerSessionId(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return (
    env.CODEX_CLAUDE_AGENT_SESSION_ID ??
    env.CODEX_THREAD_ID ??
    env.CODEX_SESSION_ID
  );
}

export function assertJobOwner(
  job: JobRecord,
  requesterOwnerSessionId = ownerSessionId(),
): void {
  if (
    job.ownerSessionId !== undefined &&
    job.ownerSessionId !== requesterOwnerSessionId
  ) {
    throw new RunnerError("E_INVALID_REQUEST", `Unknown job: ${job.jobId}`);
  }
}
