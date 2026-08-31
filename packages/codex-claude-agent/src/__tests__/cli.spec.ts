import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jobStatusSummary, main, parseRunArgs, resolvePrompt } from "../cli.js";
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

describe("--help", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("answers instead of running the command it was asked about", async () => {
    // `setup` writes ~/.codex/config.toml and used to ignore flags it did not
    // recognise, so `setup --help` performed the setup — adding a writable
    // root for whatever directory it was asked from. CODEX_HOME points at an
    // empty directory here: if help ever dispatches again, a config file
    // appears in it and this fails.
    const home = await mkdtemp(path.join(tmpdir(), "claude-help-home-"));
    const previous = process.env.CODEX_HOME;
    process.env.CODEX_HOME = home;
    const written: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    try {
      await main(["setup", "--help"]);

      expect(written.join("")).toContain("codex-claude-agent — delegate");
      expect(await readdir(home)).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previous;
    }
  });

  it("covers the short flag, a bare invocation, and every subcommand", async () => {
    for (const argv of [["-h"], [], ["run", "--help"], ["status", "-h"]]) {
      const written: string[] = [];
      const spy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation((chunk) => {
          written.push(String(chunk));
          return true;
        });

      await main(argv);

      spy.mockRestore();
      expect(written.join("")).toContain("Usage:");
    }
  });
});

describe("--timeout units", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const parse = async (value: string) =>
    parseRunArgs(["--cwd", "/tmp", "--timeout", value, "review"]);

  it("warns on a bare number small enough to be a unit slip", async () => {
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });

    // A real invocation from a Codex session: 1800 meant half an hour and
    // bought 1.8 seconds.
    const parsed = await parse("1800");

    expect(parsed.request.timeoutMs).toBe(1800);
    expect(stderr.join("")).toContain("is 1.8s");
    expect(stderr.join("")).toContain("1800s or 30m");
  });

  it("says nothing when the value carries a unit or is plainly deliberate", async () => {
    const stderr: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });

    expect((await parse("30m")).request.timeoutMs).toBe(1_800_000);
    expect((await parse("1800s")).request.timeoutMs).toBe(1_800_000);
    expect((await parse("1800000")).request.timeoutMs).toBe(1_800_000);
    expect(stderr.join("")).toBe("");
  });
});
