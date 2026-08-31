import { createGitRepositoryFixture } from "./helpers/git-repository.js";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdir,
  mkdtemp,
  readFile,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  appendEvent,
  cancelJob,
  createJob,
  failJob,
  getProcessIdentity,
  parseLinuxProcessStartTime,
  readJob,
  reconcileJob,
  resolveJobPaths,
  transitionJob,
  updateJob,
} from "../jobs/index.js";
import { RunRequestSchema } from "../schema.js";

describe("background job integration", () => {
  it("parses Linux process start time when the command contains spaces", () => {
    const fieldsFromState = [
      "S",
      ...Array.from({ length: 18 }, (_, index) => String(index + 4)),
      "4242",
    ];
    expect(
      parseLinuxProcessStartTime(
        `123 (worker command with spaces) ${fieldsFromState.join(" ")}`,
      ),
    ).toBe("4242");
  });

  it("reconciles a dead worker into a durable failure result", async () => {
    const root = await createGitRepositoryFixture("codex-claude-jobs-");
    const request = RunRequestSchema.parse({ prompt: "Review", cwd: root });
    await createJob(root, request, "dead-worker");
    await updateJob(root, "dead-worker", {
      state: "running",
      pid: 2_147_483_647,
      processIdentity: "missing",
      startedAt: new Date().toISOString(),
      worktree: {
        path: path.join(root, ".codex-claude", "worktrees", "dead-worker"),
        branch: "codex-claude/dead-worker",
        created: true,
        removed: false,
      },
    });
    const reconciled = await reconcileJob(root, "dead-worker");
    expect(reconciled.state).toBe("failed");
    const persisted = await readFile(
      resolveJobPaths(root, reconciled.jobId).resultPath,
      "utf8",
    );
    expect(persisted).toContain("worker exited");
    expect(persisted).toContain("W_WORKTREE_RETAINED");
    expect(persisted).toContain("dead-worker");
  });

  it("preserves a live job when process identity probing is transiently unavailable", async () => {
    const root = await createGitRepositoryFixture("codex-claude-jobs-");
    const request = RunRequestSchema.parse({ prompt: "Review", cwd: root });
    await createJob(root, request, "identity-probe");
    await updateJob(root, "identity-probe", {
      state: "running",
      pid: process.pid,
      processIdentity: "known-process",
      startedAt: new Date().toISOString(),
    });

    const reconciled = await reconcileJob(root, "identity-probe", {
      getIdentity: async () => undefined,
    });

    expect(reconciled.state).toBe("running");
    expect(reconciled.pid).toBe(process.pid);
    expect(reconciled.processIdentity).toBe("known-process");
  });

  it("serializes contenders while recovering a stale lock", async () => {
    const root = await createGitRepositoryFixture("codex-claude-jobs-");
    const request = RunRequestSchema.parse({ prompt: "Review", cwd: root });
    await createJob(root, request, "stale-lock");
    const lockPath = `${resolveJobPaths(root, "stale-lock").recordPath}.lock`;
    await writeFile(
      lockPath,
      `${JSON.stringify({ token: "stale", pid: 2_147_483_647 })}\n`,
    );
    const staleTime = new Date(Date.now() - 60_000);
    await utimes(lockPath, staleTime, staleTime);
    const lockDetails = await stat(lockPath);
    const abandonedReaper = `${lockPath}.reaper.${lockDetails.dev}.${lockDetails.ino}`;
    await writeFile(
      abandonedReaper,
      `${JSON.stringify({ token: "abandoned", pid: 2_147_483_647 })}\n`,
    );
    await utimes(abandonedReaper, staleTime, staleTime);

    await Promise.all([
      updateJob(root, "stale-lock", {
        startedAt: "2026-08-23T00:00:00.000Z",
      }),
      updateJob(root, "stale-lock", { dedicatedProcess: true }),
    ]);

    expect(await readJob(root, "stale-lock")).toMatchObject({
      startedAt: "2026-08-23T00:00:00.000Z",
      dedicatedProcess: true,
    });
  });

  it("immediately recovers a lock whose recorded owner is dead", async () => {
    const root = await createGitRepositoryFixture("codex-claude-jobs-");
    const request = RunRequestSchema.parse({ prompt: "Review", cwd: root });
    await createJob(root, request, "dead-owner-lock");
    const lockPath = `${resolveJobPaths(root, "dead-owner-lock").recordPath}.lock`;
    await writeFile(
      lockPath,
      `${JSON.stringify({ token: "dead", pid: 2_147_483_647 })}\n`,
    );

    await updateJob(root, "dead-owner-lock", { dedicatedProcess: true });

    expect(await readJob(root, "dead-owner-lock")).toMatchObject({
      dedicatedProcess: true,
    });
  });

  it("recovers an old lock after its PID is reused by another process", async () => {
    const root = await createGitRepositoryFixture("codex-claude-jobs-");
    const request = RunRequestSchema.parse({ prompt: "Review", cwd: root });
    await createJob(root, request, "reused-owner-pid");
    const lockPath = `${resolveJobPaths(root, "reused-owner-pid").recordPath}.lock`;
    await writeFile(
      lockPath,
      `${JSON.stringify({ token: "old", pid: process.pid, processIdentity: "different-process" })}\n`,
    );
    const staleTime = new Date(Date.now() - 60_000);
    await utimes(lockPath, staleTime, staleTime);

    await updateJob(root, "reused-owner-pid", { dedicatedProcess: true });

    expect(await readJob(root, "reused-owner-pid")).toMatchObject({
      dedicatedProcess: true,
    });
  });

  it("lets only one competing failure transition publish artifacts", async () => {
    const root = await createGitRepositoryFixture("codex-claude-jobs-");
    const request = RunRequestSchema.parse({ prompt: "Review", cwd: root });
    await createJob(root, request, "competing-failures");
    await updateJob(root, "competing-failures", { state: "running" });

    await Promise.all([
      failJob(root, "competing-failures", "first failure"),
      failJob(root, "competing-failures", "second failure"),
    ]);

    const log = await readFile(
      resolveJobPaths(root, "competing-failures").logPath,
      "utf8",
    );
    expect(log.trim().split("\n")).toHaveLength(1);
  });

  it("does not apply launch metadata after a job becomes terminal", async () => {
    const root = await createGitRepositoryFixture("codex-claude-jobs-");
    const request = RunRequestSchema.parse({ prompt: "Review", cwd: root });
    await createJob(root, request, "terminal-launch");
    await updateJob(root, "terminal-launch", { state: "completed" });

    const transition = await transitionJob(
      root,
      "terminal-launch",
      {
        pid: process.pid,
        processIdentity: "late-launcher",
        detachedProcessGroup: true,
      },
      ["queued", "running"],
    );

    expect(transition.applied).toBe(false);
    expect(transition.job.state).toBe("completed");
    expect(transition.job).not.toHaveProperty("pid");
    expect(transition.job).not.toHaveProperty("processIdentity");
    expect(transition.job).not.toHaveProperty("detachedProcessGroup");
  });

  it("refuses to signal a shared host process", async () => {
    const root = await createGitRepositoryFixture("codex-claude-jobs-");
    const request = RunRequestSchema.parse({ prompt: "Review", cwd: root });
    await createJob(root, request, "shared-host");
    const identity = await getProcessIdentity(process.pid);
    expect(identity).toBeDefined();
    await updateJob(root, "shared-host", {
      state: "running",
      pid: process.pid,
      processIdentity: identity,
      dedicatedProcess: false,
      startedAt: new Date().toISOString(),
    });

    await expect(cancelJob(root, "shared-host")).rejects.toThrow(
      "shared host process",
    );
    expect((await readJob(root, "shared-host")).state).toBe("running");
  });

  it("denies cancellation from a different owner session", async () => {
    const root = await createGitRepositoryFixture("codex-claude-jobs-");
    const previous = process.env.CODEX_CLAUDE_AGENT_SESSION_ID;
    try {
      process.env.CODEX_CLAUDE_AGENT_SESSION_ID = "owner-a";
      const request = RunRequestSchema.parse({ prompt: "Review", cwd: root });
      await createJob(root, request, "owned-job");
      process.env.CODEX_CLAUDE_AGENT_SESSION_ID = "owner-b";
      await expect(cancelJob(root, "owned-job")).rejects.toThrow("Unknown job");
    } finally {
      if (previous === undefined)
        delete process.env.CODEX_CLAUDE_AGENT_SESSION_ID;
      else process.env.CODEX_CLAUDE_AGENT_SESSION_ID = previous;
    }
  });

  it("escalates cancellation when a worker ignores SIGTERM", async () => {
    if (process.platform === "win32") return;
    const root = await createGitRepositoryFixture("codex-claude-jobs-");
    const request = RunRequestSchema.parse({ prompt: "Edit", cwd: root });
    await createJob(root, request, "stubborn-worker");
    const child = spawn(
      process.execPath,
      [
        "-e",
        "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000)",
      ],
      { detached: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    try {
      if (!child.stdout) throw new Error("Expected captured worker stdout.");
      await once(child.stdout, "data");
      const childPid = child.pid;
      if (!childPid) throw new Error("Expected spawned worker PID.");
      const identity = await getProcessIdentity(childPid);
      expect(identity).toBeDefined();
      await updateJob(root, "stubborn-worker", {
        state: "running",
        pid: childPid,
        processIdentity: identity,
        detachedProcessGroup: true,
        dedicatedProcess: true,
        startedAt: new Date().toISOString(),
      });
      const cancelled = await cancelJob(root, "stubborn-worker");
      expect(cancelled.state).toBe("cancelled");
      expect(() => process.kill(childPid, 0)).toThrow();
    } finally {
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          // The cancellation path already stopped it.
        }
      }
    }
  }, 10_000);

  it("cancels a non-detached foreground worker by its exact PID", async () => {
    if (process.platform === "win32") return;
    const root = await createGitRepositoryFixture("codex-claude-jobs-");
    const request = RunRequestSchema.parse({ prompt: "Edit", cwd: root });
    await createJob(root, request, "foreground-worker");
    const child = spawn(
      process.execPath,
      [
        "-e",
        "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000)",
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    try {
      if (!child.stdout) throw new Error("Expected captured worker stdout.");
      await once(child.stdout, "data");
      const childPid = child.pid;
      if (!childPid) throw new Error("Expected spawned worker PID.");
      const identity = await getProcessIdentity(childPid);
      expect(identity).toBeDefined();
      await updateJob(root, "foreground-worker", {
        state: "running",
        pid: childPid,
        processIdentity: identity,
        detachedProcessGroup: false,
        dedicatedProcess: true,
        startedAt: new Date().toISOString(),
      });

      const cancelled = await cancelJob(root, "foreground-worker");

      expect(cancelled.state).toBe("cancelled");
      expect(() => process.kill(childPid, 0)).toThrow();
    } finally {
      if (child.pid) {
        try {
          process.kill(child.pid, "SIGKILL");
        } catch {
          // The cancellation path already stopped it.
        }
      }
    }
  }, 10_000);

  it("refuses to append through a job-log symlink", async () => {
    const root = await createGitRepositoryFixture("codex-claude-jobs-");
    const request = RunRequestSchema.parse({ prompt: "Review", cwd: root });
    await createJob(root, request, "symlink-log");
    const target = path.join(root, "outside.txt");
    await writeFile(target, "unchanged");
    const paths = resolveJobPaths(root, "symlink-log");
    await symlink(target, paths.logPath);
    await expect(
      appendEvent(root, "symlink-log", {
        type: "result",
        ts: new Date().toISOString(),
        jobId: "symlink-log",
        seq: 1,
        data: { ok: true },
      }),
    ).rejects.toThrow();
    await expect(readFile(target, "utf8")).resolves.toBe("unchanged");
  });

  it("refuses a symlinked artifact directory", async () => {
    const root = await createGitRepositoryFixture("codex-claude-jobs-");
    const outside = await mkdtemp(path.join(tmpdir(), "codex-claude-outside-"));
    const { jobsDir } = resolveJobPaths(root, "symlink-directory");
    await mkdir(path.dirname(jobsDir), { recursive: true });
    await symlink(outside, jobsDir);
    const request = RunRequestSchema.parse({ prompt: "Review", cwd: root });
    await expect(createJob(root, request, "symlink-directory")).rejects.toThrow(
      "unsafe job artifact directory",
    );
  });
});
