import { readdir } from "node:fs/promises";
import path from "node:path";

import { JobRecordSchema, type JobRecord } from "../schema.js";
import { readFileNoFollow } from "../utils/secure-files.js";
import { reconcileJob } from "./lifecycle.js";
import { resolveJobPaths } from "./paths.js";
import { maybeGarbageCollectJobs } from "./retention.js";

const DEFAULT_JOB_SCAN_LIMIT = 500;

export interface ListJobsOptions {
  limit?: number;
  unreadOnly?: boolean;
  ownerSessionId?: string;
  scanLimit?: number;
}

export async function listJobs(
  repoRoot: string,
  options: ListJobsOptions = {},
): Promise<JobRecord[]> {
  await maybeGarbageCollectJobs(repoRoot);
  const { jobsDir } = resolveJobPaths(repoRoot, "placeholder");
  const entries = (await readdir(jobsDir).catch(() => []))
    .filter(
      (entry) => entry.endsWith(".json") && !entry.endsWith(".request.json"),
    )
    .sort()
    .reverse();
  const records: JobRecord[] = [];
  const scanLimit = options.scanLimit ?? DEFAULT_JOB_SCAN_LIMIT;
  let scanned = 0;
  for (const entry of entries) {
    scanned += 1;
    if (scanned > scanLimit) break;
    try {
      const parsed = JobRecordSchema.parse(
        JSON.parse(await readFileNoFollow(path.join(jobsDir, entry))),
      );
      if (
        options.ownerSessionId &&
        parsed.ownerSessionId !== options.ownerSessionId
      )
        continue;
      if (
        options.unreadOnly &&
        !parsed.unread &&
        !["queued", "running"].includes(parsed.state)
      )
        continue;
      const reconciled = await reconcileJob(repoRoot, parsed);
      if (options.unreadOnly && !reconciled.unread) continue;
      records.push(reconciled);
      if (options.limit !== undefined && records.length >= options.limit) break;
    } catch {
      // Ignore partial or foreign state files.
    }
  }
  return records.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}
