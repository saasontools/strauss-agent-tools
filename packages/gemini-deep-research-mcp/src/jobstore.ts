import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getHomeDir, type Depth } from "./config.js";
import { log } from "./logger.js";

export const SCHEMA_VERSION = 1;

/** Local mirror of a research job. The job itself lives on Google's
 * infrastructure and survives process death; this record only maps our stable
 * job_id to the interaction_id plus enough metadata to list and fetch without
 * a network round-trip. Never contains the API key. */
export interface JobRecord {
  schemaVersion: number;
  jobId: string;
  interactionId: string;
  query: string;
  depth: Depth;
  /** Agent we asked for (client-side intent). */
  agent: string;
  /** Collaborative planning was requested on start. */
  collaborativePlanning?: boolean;
  /** Agent name echoed back by the API — what actually ran. */
  echoedAgent?: string;
  /** agent_config echoed back by the API — the flags it accepted. */
  echoedAgentConfig?: { [key: string]: unknown };
  /** A planning reply was sent; the plan pause (if any) is behind us. */
  replied?: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  /** Set once the report has been persisted locally. */
  reportPath?: string;
  /** Human-readable failure summary, if the run failed. */
  error?: string;
  /** URL citations captured when the run finished. */
  sources?: Array<{ url: string; title?: string }>;
  /** Human-readable token usage line captured when the run finished. */
  usage?: string;
}

function jobsDir(): string {
  return join(getHomeDir(), "jobs");
}

function reportsDir(): string {
  return join(getHomeDir(), "reports");
}

/** Creates the storage tree with owner-only permissions. Reports may contain
 * research the user considers sensitive. */
export function ensureStorage(): void {
  for (const dir of [getHomeDir(), jobsDir(), reportsDir()]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }
}

export function newJobId(): string {
  return `job_${randomBytes(6).toString("hex")}`;
}

function jobPath(jobId: string): string {
  // Defence against path traversal via a crafted job id.
  if (!/^job_[0-9a-f]{12}$/.test(jobId)) {
    throw new Error(`Invalid job id: ${jobId}`);
  }
  return join(jobsDir(), `${jobId}.json`);
}

/**
 * Atomic write: tmp file + rename. Two MCP clients can share a home
 * directory; a half-written job file must never be observable.
 */
function writeFileAtomic(path: string, data: string, mode: number): void {
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    writeFileSync(tmp, data, { mode });
    renameSync(tmp, path);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // best-effort cleanup
    }
    throw err;
  }
}

export function saveJob(record: JobRecord): void {
  ensureStorage();
  writeFileAtomic(
    jobPath(record.jobId),
    JSON.stringify(record, null, 2) + "\n",
    0o600,
  );
}

/**
 * Defensive read: unknown schema versions and malformed files return
 * undefined (with a warning) instead of throwing, so one stranded file cannot
 * break list/status for every other job.
 */
export function readJob(jobId: string): JobRecord | undefined {
  const path = jobPath(jobId);
  if (!existsSync(path)) return undefined;
  return parseJobFile(path);
}

function parseJobFile(path: string): JobRecord | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const record = parsed as Partial<JobRecord>;
    if (
      record.schemaVersion !== SCHEMA_VERSION ||
      typeof record.jobId !== "string" ||
      typeof record.interactionId !== "string"
    ) {
      log.warn("Skipping job file with unknown schema or shape", { path });
      return undefined;
    }
    return record as JobRecord;
  } catch (err) {
    log.warn("Skipping unreadable job file", { path, error: String(err) });
    return undefined;
  }
}

export function listJobs(): JobRecord[] {
  ensureStorage();
  const records: JobRecord[] = [];
  for (const file of readdirSync(jobsDir())) {
    if (!file.endsWith(".json")) continue;
    const record = parseJobFile(join(jobsDir(), file));
    if (record) records.push(record);
  }
  // Newest first.
  records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return records;
}

export function updateJob(
  jobId: string,
  patch: Partial<Omit<JobRecord, "jobId" | "schemaVersion">>,
): JobRecord | undefined {
  const existing = readJob(jobId);
  if (!existing) return undefined;
  const updated: JobRecord = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  saveJob(updated);
  return updated;
}

/** Persists a report and returns its path. Owner-readable only. */
export function saveReport(jobId: string, markdown: string): string {
  ensureStorage();
  const path = join(reportsDir(), `${jobId}.md`);
  writeFileAtomic(path, markdown, 0o600);
  chmodSync(path, 0o600);
  return path;
}

export function readReport(jobId: string): string | undefined {
  const record = readJob(jobId);
  if (!record?.reportPath || !existsSync(record.reportPath)) return undefined;
  return readFileSync(record.reportPath, "utf8");
}
