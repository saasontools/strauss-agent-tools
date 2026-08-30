import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

import { JobRecordSchema } from "../schema.js";
import {
  readFileNoFollow,
  writeFileAtomically,
} from "../utils/secure-files.js";
import { resolveJobPaths } from "./paths.js";
import { getProcessIdentity } from "./processes.js";
import { ensureSecureDirectory } from "./storage.js";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const GC_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const GC_BATCH_LIMIT = 500;

export async function garbageCollectJobs(repoRoot: string): Promise<void> {
  const { jobsDir } = resolveJobPaths(repoRoot, "placeholder");
  const entries = (await readdir(jobsDir).catch(() => []))
    .filter((entry) => !entry.startsWith("."))
    .sort();
  const cursorPath = path.join(jobsDir, ".gc-cursor");
  const cursor = await readFileNoFollow(cursorPath).catch(() => "");
  const start = cursor
    ? Math.max(
        0,
        entries.findIndex((entry) => entry > cursor.trim()),
      )
    : 0;
  const batch = entries.slice(start, start + GC_BATCH_LIMIT);
  const cutoff = Date.now() - RETENTION_MS;
  for (const entry of batch) {
    const candidate = path.join(jobsDir, entry);
    const details = await stat(candidate).catch(() => undefined);
    if (!details || details.mtimeMs >= cutoff) continue;
    if (entry.endsWith(".json") && !entry.endsWith(".request.json")) {
      try {
        const job = JobRecordSchema.parse(
          JSON.parse(await readFileNoFollow(candidate)),
        );
        if (job.pid && job.processIdentity) {
          const identity = await getProcessIdentity(job.pid);
          if (identity === job.processIdentity) continue;
        }
      } catch {
        // Invalid old state can be collected.
      }
    }
    await unlink(candidate).catch(() => undefined);
  }
  const completedCycle = start + batch.length >= entries.length;
  await writeFileAtomically(
    cursorPath,
    completedCycle ? "" : `${batch.at(-1) ?? cursor.trim()}\n`,
  );
}

export async function maybeGarbageCollectJobs(repoRoot: string): Promise<void> {
  const { jobsDir } = resolveJobPaths(repoRoot, "placeholder");
  await ensureSecureDirectory(jobsDir);
  const marker = path.join(jobsDir, ".last-gc");
  const previous = await stat(marker).catch(() => undefined);
  if (previous && Date.now() - previous.mtimeMs < GC_INTERVAL_MS) return;
  await writeFileAtomically(marker, `${new Date().toISOString()}\n`);
  await garbageCollectJobs(repoRoot);
}
