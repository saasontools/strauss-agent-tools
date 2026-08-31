import { createGitRepositoryFixture } from "./helpers/git-repository.js";
import { mkdtemp, mkdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ERROR_EXIT_CODES, RunnerError, exitCodeFor } from "../errors.js";
import { RunRequestSchema } from "../schema.js";
import { resolveWorkspace } from "../worktree.js";

const makeRepo = () => createGitRepositoryFixture("codex-claude-agent-");

describe("RunRequestSchema", () => {
  it("applies safe defaults and normalizes friendly model aliases", () => {
    const request = RunRequestSchema.parse({
      prompt: "Review",
      model: " OpUs ",
    });
    expect(request).toMatchObject({
      mode: "read-only",
      model: "opus",
      maxTurns: 40,
      maxBudgetUsd: 5,
      timeoutMs: 900_000,
      settingSources: [],
      worktree: { mode: "none" },
    });
  });

  it("rejects empty prompts and unknown keys", () => {
    expect(() => RunRequestSchema.parse({ prompt: "" })).toThrow();
    expect(() =>
      RunRequestSchema.parse({ prompt: "x", mystery: true }),
    ).toThrow();
  });
});

describe("error exit codes", () => {
  it("maps every code to a unique documented non-zero exit code", () => {
    const values = Object.values(ERROR_EXIT_CODES);
    expect(values.every((value) => value > 0)).toBe(true);
    expect(new Set(values).size).toBe(values.length);
    expect(exitCodeFor(new RunnerError("E_AUTH", "missing"))).toBe(10);
  });
});

describe("resolveWorkspace", () => {
  it("rejects non-git directories unless noGit is set", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "codex-claude-agent-no-git-"),
    );
    const request = RunRequestSchema.parse({ prompt: "x", cwd: root });
    await expect(resolveWorkspace(request, "job-test")).rejects.toMatchObject({
      code: "E_NOT_GIT_REPO",
    });

    const noGit = RunRequestSchema.parse({
      prompt: "x",
      cwd: root,
      noGit: true,
    });
    await expect(resolveWorkspace(noGit, "job-test")).resolves.toMatchObject({
      cwd: await realpath(root),
    });
  });

  it("validates existing worktrees against git registration", async () => {
    const root = await makeRepo();
    const missing = path.join(root, "missing");
    await mkdir(missing);
    const request = RunRequestSchema.parse({
      prompt: "x",
      cwd: root,
      worktree: { mode: "existing", path: missing },
    });
    await expect(resolveWorkspace(request, "job-test")).rejects.toMatchObject({
      code: "E_WORKTREE_NOT_FOUND",
    });
  });

  it("cleans a read-only ephemeral worktree and retains editable work", async () => {
    const successRepo = await makeRepo();
    const successRequest = RunRequestSchema.parse({
      prompt: "x",
      cwd: successRepo,
      mode: "read-only",
      worktree: { mode: "ephemeral" },
    });
    const success = await resolveWorkspace(successRequest, "job-success");
    expect(success.worktree?.created).toBe(true);
    expect(await success.finish(true)).toEqual([]);
    expect(success.worktree?.removed).toBe(true);

    const editableRepo = await makeRepo();
    const editableRequest = RunRequestSchema.parse({
      prompt: "x",
      cwd: editableRepo,
      mode: "edit",
      worktree: { mode: "ephemeral" },
    });
    const editable = await resolveWorkspace(editableRequest, "job-edit");
    const warnings = await editable.finish(true);
    expect(warnings[0]?.code).toBe("W_WORKTREE_RETAINED");
    expect(editable.worktree?.removed).toBe(false);
  });

  it("validates additional directories before creating a worktree", async () => {
    const root = await makeRepo();
    const request = RunRequestSchema.parse({
      prompt: "x",
      cwd: root,
      worktree: { mode: "ephemeral" },
      additionalDirectories: ["missing"],
    });
    await expect(resolveWorkspace(request, "job-no-leak")).rejects.toThrow();
    await expect(
      realpath(path.join(root, ".codex-claude", "worktrees", "job-no-leak")),
    ).rejects.toThrow();
  });
});
