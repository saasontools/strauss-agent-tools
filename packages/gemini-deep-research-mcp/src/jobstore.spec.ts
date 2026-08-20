import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureStorage,
  listJobs,
  newJobId,
  readJob,
  readReport,
  saveJob,
  saveReport,
  updateJob,
  SCHEMA_VERSION,
  type JobRecord,
} from "./jobstore.js";

let home: string;

function record(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    schemaVersion: SCHEMA_VERSION,
    jobId: newJobId(),
    interactionId: "v1_abc123",
    query: "test query",
    depth: "standard",
    agent: "deep-research-preview-04-2026",
    status: "in_progress",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "gdr-test-"));
  process.env.GEMINI_DEEP_RESEARCH_HOME = home;
});

afterEach(() => {
  delete process.env.GEMINI_DEEP_RESEARCH_HOME;
  if (existsSync(join(home, "jobs"))) {
    chmodSync(join(home, "jobs"), 0o700);
  }
  rmSync(home, { recursive: true, force: true });
});

describe("job store", () => {
  it("round-trips the planning-debug fields", () => {
    const job = record({
      collaborativePlanning: true,
      echoedAgent: "deep-research-max-preview-04-2026",
      echoedAgentConfig: {
        type: "deep-research",
        collaborative_planning: true,
      },
      replied: true,
    });
    saveJob(job);

    const read = readJob(job.jobId);
    expect(read?.collaborativePlanning).toBe(true);
    expect(read?.echoedAgent).toBe("deep-research-max-preview-04-2026");
    expect(read?.echoedAgentConfig?.collaborative_planning).toBe(true);
    expect(read?.replied).toBe(true);
  });

  it("round-trips a job record", () => {
    const job = record();
    saveJob(job);
    expect(readJob(job.jobId)).toEqual(job);
  });

  // POSIX file modes don't exist on Windows; the store's chmod calls are
  // harmless no-ops there.
  it.skipIf(process.platform === "win32")(
    "creates storage with owner-only permissions",
    () => {
      ensureStorage();
      for (const dir of [join(home, "jobs"), join(home, "reports")]) {
        expect(statSync(dir).mode & 0o777).toBe(0o700);
      }
      const job = record();
      saveJob(job);
      expect(
        statSync(join(home, "jobs", `${job.jobId}.json`)).mode & 0o777,
      ).toBe(0o600);
      const reportPath = saveReport(job.jobId, "# report");
      expect(statSync(reportPath).mode & 0o777).toBe(0o600);
    },
  );

  // Uses a read-only directory to force the write to fail, which chmod
  // cannot arrange on Windows.
  it.skipIf(process.platform === "win32")(
    "leaves no tmp files behind and keeps prior state on failed writes",
    () => {
      const job = record();
      saveJob(job);
      const before = readFileSync(
        join(home, "jobs", `${job.jobId}.json`),
        "utf8",
      );

      // Make the jobs directory unwritable: the atomic write must fail without
      // touching the existing file.
      chmodSync(join(home, "jobs"), 0o500);
      expect(() => saveJob({ ...job, status: "completed" })).toThrow();
      chmodSync(join(home, "jobs"), 0o700);

      const after = readFileSync(
        join(home, "jobs", `${job.jobId}.json`),
        "utf8",
      );
      expect(after).toBe(before);
      expect(
        readdirSync(join(home, "jobs")).filter((f) => f.endsWith(".tmp")),
      ).toEqual([]);
    },
  );

  it("skips files with an unknown schemaVersion instead of throwing", () => {
    const job = record();
    saveJob(job);
    writeFileSync(
      join(home, "jobs", "job_ffffffffffff.json"),
      JSON.stringify({ schemaVersion: 999, jobId: "job_ffffffffffff" }),
    );
    writeFileSync(join(home, "jobs", "job_eeeeeeeeeeee.json"), "not json{");

    expect(readJob("job_ffffffffffff")).toBeUndefined();
    expect(listJobs().map((j) => j.jobId)).toEqual([job.jobId]);
  });

  it("rejects path-traversal job ids", () => {
    expect(() => readJob("../../etc/passwd")).toThrow(/Invalid job id/);
  });

  it("lists newest first", () => {
    const older = record({ createdAt: "2026-08-01T00:00:00Z" });
    const newer = record({ createdAt: "2026-08-14T00:00:00Z" });
    saveJob(older);
    saveJob(newer);
    expect(listJobs().map((j) => j.jobId)).toEqual([newer.jobId, older.jobId]);
  });

  it("updates a job and bumps updatedAt", () => {
    const job = record({ updatedAt: "2026-08-01T00:00:00Z" });
    saveJob(job);
    const updated = updateJob(job.jobId, { status: "completed" });
    expect(updated?.status).toBe("completed");
    expect(updated?.updatedAt).not.toBe("2026-08-01T00:00:00Z");
    expect(updateJob("job_000000000000", { status: "x" })).toBeUndefined();
  });

  it("stores and reads back reports via the job record", () => {
    const job = record();
    saveJob(job);
    const path = saveReport(job.jobId, "# Findings\n");
    updateJob(job.jobId, { reportPath: path });
    expect(readReport(job.jobId)).toBe("# Findings\n");
    expect(readReport(record().jobId)).toBeUndefined();
  });
});
