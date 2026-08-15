import { errorSummary, reportText } from "./extract.js";
import { getInteraction } from "./gemini.js";
import { readJob, saveReport, updateJob, type JobRecord } from "./jobstore.js";
import { log } from "./logger.js";
import type { InteractionLike } from "./types.js";
import { isTerminal, mayHaveReport } from "./types.js";

/** Called whenever a job newly reaches a terminal state (used to emit
 * resources/list_changed). Wired up by the server module. */
export type OnJobTerminal = (job: JobRecord) => void;

export interface RefreshResult {
  job: JobRecord;
  interaction?: InteractionLike;
}

/**
 * Brings a job record up to date with the remote interaction. Terminal jobs
 * with a persisted report are served from disk with no network round-trip.
 * On a new terminal state the report (full or partial) is extracted and
 * persisted, and onTerminal fires.
 */
export async function refreshJob(
  jobId: string,
  onTerminal?: OnJobTerminal,
): Promise<RefreshResult | undefined> {
  const job = readJob(jobId);
  if (!job) return undefined;

  if (
    isTerminal(job.status) &&
    (job.reportPath || !mayHaveReport(job.status))
  ) {
    return { job };
  }

  const interaction = await getInteraction(job.interactionId);
  const wasTerminal = isTerminal(job.status);
  const patch: Parameters<typeof updateJob>[1] = { status: interaction.status };

  if (mayHaveReport(interaction.status)) {
    const text = reportText(interaction);
    if (text) {
      patch.reportPath = saveReport(job.jobId, text);
    }
  }
  if (interaction.status === "failed") {
    patch.error = errorSummary(interaction) ?? "Research run failed.";
  }

  const updated = updateJob(jobId, patch) ?? { ...job, ...patch };
  if (!wasTerminal && isTerminal(updated.status)) {
    log.info("Job reached terminal state", {
      jobId,
      status: updated.status,
    });
    onTerminal?.(updated);
  }
  return { job: updated, interaction };
}

/** Human-readable elapsed time since the job started. */
export function elapsed(job: JobRecord): string {
  const ms = Date.now() - Date.parse(job.createdAt);
  if (!Number.isFinite(ms) || ms < 0) return "unknown";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m${seconds}s` : `${seconds}s`;
}
