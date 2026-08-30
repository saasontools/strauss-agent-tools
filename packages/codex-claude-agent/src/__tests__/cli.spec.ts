import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { jobStatusSummary, parseRunArgs, resolvePrompt } from "../cli.js";
import { JobRecordSchema } from "../schema.js";

describe("prompt resolution precedence", () => {
  it("uses --prompt before prompt file and stdin", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "claude-prompt-"));
    await writeFile(path.join(root, "prompt.txt"), "from file");
    await expect(
      resolvePrompt({
        prompt: "inline",
        promptFile: "prompt.txt",
        stdin: "stdin",
        cwd: root,
      }),
    ).resolves.toBe("inline");
  });

  it("uses free text, then prompt file, then stdin", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "claude-prompt-"));
    await writeFile(path.join(root, "prompt.txt"), "from file");
    await expect(
      resolvePrompt({
        freeText: ["free", "text"],
        promptFile: "prompt.txt",
        stdin: "stdin",
        cwd: root,
      }),
    ).resolves.toBe("free text");
    await expect(
      resolvePrompt({ promptFile: "prompt.txt", stdin: "stdin", cwd: root }),
    ).resolves.toBe("from file");
    await expect(resolvePrompt({ stdin: "stdin" })).resolves.toBe("stdin");
  });
});

describe("run flags", () => {
  it("maps worktree, budget, schema-independent flags, and free text", async () => {
    const parsed = await parseRunArgs(
      [
        "--cwd",
        "/tmp",
        "--worktree",
        "create",
        "--worktree-path",
        "/tmp/wt",
        "--edit",
        "--model",
        "OpUs",
        "--budget",
        "2",
        "--timeout",
        "30s",
        "--json",
        "implement",
        "it",
      ],
      "",
    );
    expect(parsed.format).toBe("json");
    expect(parsed.request).toMatchObject({
      prompt: "implement it",
      cwd: "/tmp",
      mode: "edit",
      model: "OpUs",
      maxBudgetUsd: 2,
      timeoutMs: 30_000,
      worktree: { mode: "create", path: "/tmp/wt" },
    });
  });
});

describe("job status output", () => {
  it("omits delegated content and worker identity", () => {
    const job = JobRecordSchema.parse({
      version: 1,
      jobId: "job-1",
      state: "running",
      request: { prompt: "secret delegated prompt" },
      repoRoot: "/private/repo",
      ownerSessionId: "owner-secret",
      unread: false,
      pid: 1234,
      processIdentity: "process-secret",
      createdAt: "2026-08-23T00:00:00.000Z",
      updatedAt: "2026-08-23T00:00:01.000Z",
      tags: { ticket: "secret-tag" },
    });

    expect(jobStatusSummary(job)).toEqual({
      version: 1,
      jobId: "job-1",
      state: "running",
      unread: false,
      createdAt: "2026-08-23T00:00:00.000Z",
      updatedAt: "2026-08-23T00:00:01.000Z",
      startedAt: undefined,
      completedAt: undefined,
      notifiedAt: undefined,
    });
  });
});
