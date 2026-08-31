import { createGitRepositoryFixture } from "./helpers/git-repository.js";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { RunnerError } from "../errors.js";
import {
  cancelJob,
  createJob,
  readJob,
  resolveJobPaths,
} from "../jobs/index.js";
import { runClaude } from "../run.js";
import { RunRequestSchema } from "../schema.js";
import type { ExecuteQueryRequest, RawOutcome } from "../sdk.js";

const makeRepo = () => createGitRepositoryFixture("codex-claude-run-");

function success(overrides: Partial<RawOutcome> = {}): RawOutcome {
  return {
    sessionId: "session-1",
    result: "Done.",
    turns: 2,
    costUsd: 0.25,
    durationMs: 100,
    model: "sonnet",
    warnings: [],
    ...overrides,
  };
}

let originalApiKey: string | undefined;
let originalClaudePath: string | undefined;
let stubbedClaude: string;

beforeAll(async () => {
  // These suites replace the executor, so no Claude Code is ever spawned — but
  // `runClaude` still runs diagnostics, which refuses to start without an
  // executable on the host. Stubbing the path is the same move this file
  // already makes for ANTHROPIC_API_KEY: a machine-level precondition that
  // orchestration tests must not depend on. Without it the suite passes only
  // on a developer machine that happens to have Claude Code installed.
  const dir = await mkdtemp(path.join(tmpdir(), "codex-claude-stub-"));
  stubbedClaude = path.join(dir, "claude");
  await writeFile(stubbedClaude, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
});

beforeEach(() => {
  originalApiKey = process.env.ANTHROPIC_API_KEY;
  originalClaudePath = process.env.CODEX_CLAUDE_AGENT_CLAUDE_PATH;
  process.env.ANTHROPIC_API_KEY = "test-only";
  process.env.CODEX_CLAUDE_AGENT_CLAUDE_PATH = stubbedClaude;
});

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalApiKey;
  if (originalClaudePath === undefined)
    delete process.env.CODEX_CLAUDE_AGENT_CLAUDE_PATH;
  else process.env.CODEX_CLAUDE_AGENT_CLAUDE_PATH = originalClaudePath;
});

describe("runClaude foreground integration", () => {
  it("returns and persists a successful stable result", async () => {
    const root = await makeRepo();
    const result = await runClaude(
      { prompt: "Review", cwd: root },
      {
        execute: async () => success(),
        retryOptions: { sleep: async () => undefined },
      },
    );
    // Asserted first, and on its own: `toMatchObject` elides the rest of the
    // object, so a failure here once read `{ ok: false, …(8) }` with the code
    // and message hidden — undiagnosable from a CI log. This prints the error.
    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({
      ok: true,
      result: "Done.",
      sessionId: "session-1",
    });
    await expect(
      access(result.artifacts?.resultPath ?? ""),
    ).resolves.toBeUndefined();
    await expect(
      access(result.artifacts?.logPath ?? ""),
    ).resolves.toBeUndefined();
  });

  it("does not mark a job completed when its result cannot be persisted", async () => {
    const root = await makeRepo();
    const jobId = "result-write-failure";
    const events: Array<{ type: string; data?: Record<string, unknown> }> = [];
    const result = await runClaude(
      { prompt: "Review", cwd: root },
      {
        jobId,
        execute: async () => {
          await mkdir(resolveJobPaths(root, jobId).resultPath);
          return success();
        },
        stream: (event) => events.push(event),
      },
    );

    expect(result.error?.code).toBe("E_EXECUTION");
    expect(await readJob(root, jobId)).toMatchObject({
      state: "failed",
      result: {
        ok: false,
        error: { code: "E_EXECUTION" },
      },
    });
    expect(
      events.some(
        (event) => event.type === "result" && event.data?.ok === true,
      ),
    ).toBe(false);
  });

  it("keeps a committed success when its terminal subscriber throws", async () => {
    const root = await makeRepo();
    const jobId = "throwing-success-subscriber";

    const result = await runClaude(
      { prompt: "Review", cwd: root },
      {
        jobId,
        execute: async () => success(),
        stream: (event) => {
          if (event.type === "result" && event.data?.ok === true) {
            throw new Error("subscriber failed");
          }
        },
      },
    );

    expect(result.ok).toBe(true);
    expect((await readJob(root, jobId)).state).toBe("completed");
  });

  it("maps max-turns without retrying", async () => {
    const root = await makeRepo();
    const execute = vi.fn(async () => {
      throw new RunnerError("E_MAX_TURNS", "turn limit", {
        sessionId: "session-max",
      });
    });
    const result = await runClaude(
      { prompt: "Review", cwd: root },
      { execute, retryOptions: { sleep: async () => undefined } },
    );
    expect(result.error).toMatchObject({ code: "E_MAX_TURNS", attempts: 1 });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure and succeeds", async () => {
    const root = await makeRepo();
    const execute = vi
      .fn<
        (
          request: ExecuteQueryRequest,
          signal: AbortSignal,
        ) => Promise<RawOutcome>
      >()
      .mockRejectedValueOnce(
        new RunnerError("E_TRANSIENT_API", "overloaded", {
          retryable: true,
          sessionId: "session-retry",
        }),
      )
      .mockResolvedValue(success({ sessionId: "session-retry" }));
    const result = await runClaude(
      { prompt: "Review", cwd: root },
      {
        execute,
        retryOptions: { sleep: async () => undefined, random: () => 0 },
      },
    );
    expect(result.ok).toBe(true);
    expect(result.warnings.some((warning) => warning.code === "W_RETRY")).toBe(
      true,
    );
    expect(execute.mock.calls[1]?.[0].resume).toBe("session-retry");
  });

  it("repairs structured output once in the same session", async () => {
    const root = await makeRepo();
    const execute = vi
      .fn<
        (
          request: ExecuteQueryRequest,
          signal: AbortSignal,
        ) => Promise<RawOutcome>
      >()
      .mockResolvedValueOnce(
        success({ result: '{"count":"bad"}', structured: { count: "bad" } }),
      )
      .mockResolvedValueOnce(
        success({ result: '{"count":1}', structured: { count: 1 } }),
      );
    const result = await runClaude(
      {
        prompt: "Count",
        cwd: root,
        outputSchema: {
          type: "object",
          properties: { count: { type: "number" } },
          required: ["count"],
          additionalProperties: false,
        },
      },
      {
        execute,
        retryOptions: { sleep: async () => undefined, random: () => 0 },
      },
    );
    expect(result).toMatchObject({ ok: true, structured: { count: 1 } });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1]?.[0].resume).toBe("session-1");
    expect(execute.mock.calls[1]?.[0].prompt).toContain(
      "Return only a corrected JSON",
    );
  });

  it("keeps the repair prompt after a transient repair failure", async () => {
    const root = await makeRepo();
    const execute = vi
      .fn<
        (
          request: ExecuteQueryRequest,
          signal: AbortSignal,
        ) => Promise<RawOutcome>
      >()
      .mockResolvedValueOnce(
        success({ result: '{"count":"bad"}', structured: { count: "bad" } }),
      )
      .mockRejectedValueOnce(
        new RunnerError("E_TRANSIENT_API", "overloaded", {
          retryable: true,
          sessionId: "session-1",
        }),
      )
      .mockResolvedValueOnce(
        success({ result: '{"count":1}', structured: { count: 1 } }),
      );
    const result = await runClaude(
      {
        prompt: "Perform edits and count them",
        cwd: root,
        outputSchema: {
          type: "object",
          properties: { count: { type: "number" } },
          required: ["count"],
        },
      },
      {
        execute,
        retryOptions: { sleep: async () => undefined, random: () => 0 },
      },
    );
    expect(result.ok).toBe(true);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(execute.mock.calls[1]?.[0].prompt).toContain(
      "Return only a corrected JSON",
    );
    expect(execute.mock.calls[2]?.[0].prompt).toContain(
      "Return only a corrected JSON",
    );
  });

  it("accepts draft 2020-12 output schemas", async () => {
    const root = await makeRepo();
    const result = await runClaude(
      {
        prompt: "Count",
        cwd: root,
        outputSchema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: { count: { type: "number" } },
          required: ["count"],
        },
      },
      { execute: async () => success({ structured: { count: 1 } }) },
    );
    expect(result).toMatchObject({ ok: true, structured: { count: 1 } });
  });

  it("enforces standard JSON Schema formats", async () => {
    const root = await makeRepo();
    const execute = vi.fn(async () =>
      success({ structured: { email: "not-an-email" } }),
    );
    const result = await runClaude(
      {
        prompt: "Return an email",
        cwd: root,
        outputSchema: {
          type: "object",
          properties: { email: { type: "string", format: "email" } },
          required: ["email"],
        },
        retry: { maxAttempts: 1 },
      },
      { execute },
    );
    expect(result.error?.code).toBe("E_STRUCTURED_OUTPUT");
  });

  it("does not persist tool payloads or text deltas", async () => {
    const root = await makeRepo();
    const result = await runClaude(
      { prompt: "Review", cwd: root },
      {
        execute: async (request) => {
          request.onEvent?.({
            type: "tool_use",
            data: { name: "Read", input: { secret: "do-not-persist" } },
          });
          request.onEvent?.({
            type: "text_delta",
            data: { text: "private-response-fragment" },
          });
          return success();
        },
      },
    );
    const log = await readFile(result.artifacts?.logPath ?? "", "utf8");
    expect(log).not.toContain("do-not-persist");
    expect(log).not.toContain("private-response-fragment");
    expect(log).toContain("tool_use");
  });

  it("does not execute a worker after cancellation wins the claim race", async () => {
    const root = await makeRepo();
    const request = RunRequestSchema.parse({ prompt: "Edit", cwd: root });
    await createJob(root, request, "job-cancelled-before-claim");
    const cancelled = await cancelJob(root, "job-cancelled-before-claim");
    expect(cancelled.state).toBe("cancelled");
    await expect(
      access(resolveJobPaths(root, cancelled.jobId).resultPath),
    ).resolves.toBeUndefined();

    const execute = vi.fn(async () => success());
    const result = await runClaude(request, {
      jobId: "job-cancelled-before-claim",
      backgroundWorker: true,
      execute,
    });
    expect(result.error?.code).toBe("E_CANCELLED");
    expect(execute).not.toHaveBeenCalled();
    expect((await readJob(root, result.jobId)).state).toBe("cancelled");
  });

  it("records detached process-group ownership when a worker claims a job", async () => {
    const root = await makeRepo();
    const request = RunRequestSchema.parse({ prompt: "Edit", cwd: root });
    await createJob(root, request, "detached-worker-claim");

    const result = await runClaude(request, {
      jobId: "detached-worker-claim",
      backgroundWorker: true,
      execute: async () => {
        expect(await readJob(root, "detached-worker-claim")).toMatchObject({
          state: "running",
          dedicatedProcess: true,
          detachedProcessGroup: true,
        });
        return success();
      },
    });

    expect(result.ok).toBe(true);
  });

  it("does not fail an existing job when a background job ID collides", async () => {
    const root = await makeRepo();
    const request = RunRequestSchema.parse({ prompt: "Existing", cwd: root });
    await createJob(root, request, "existing-background-job");
    const result = await runClaude(
      {
        prompt: "New launch",
        cwd: root,
        background: true,
      },
      { jobId: "existing-background-job" },
    );
    expect(result.error?.code).toBe("E_INVALID_REQUEST");
    expect((await readJob(root, "existing-background-job")).state).toBe(
      "queued",
    );
  });

  it("rejects executable agent definition files without importing them", async () => {
    const root = await makeRepo();
    const marker = path.join(root, "executed.txt");
    await writeFile(
      path.join(root, "agents.mjs"),
      `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'executed'); export default {};`,
    );
    const execute = vi.fn(async () => success());
    const result = await runClaude(
      { prompt: "Review", cwd: root, agentsFile: "agents.mjs" },
      { execute },
    );
    expect(result.error?.code).toBe("E_INVALID_REQUEST");
    await expect(access(marker)).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });

  it("aborts on timeout and reports E_TIMEOUT", async () => {
    const root = await makeRepo();
    const execute = async (
      _request: ExecuteQueryRequest,
      signal: AbortSignal,
    ): Promise<RawOutcome> =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    const result = await runClaude(
      { prompt: "Wait", cwd: root, timeoutMs: 10 },
      { execute, retryOptions: { sleep: async () => undefined } },
    );
    expect(result.error?.code).toBe("E_TIMEOUT");
  });

  it("cleans read-only ephemeral worktrees and retains editable ones", async () => {
    const successRoot = await makeRepo();
    const completed = await runClaude(
      {
        prompt: "Review",
        cwd: successRoot,
        worktree: { mode: "ephemeral" },
      },
      {
        execute: async () => success(),
        retryOptions: { sleep: async () => undefined },
      },
    );
    expect(completed.worktree?.removed).toBe(true);
    await expect(access(completed.worktree?.path ?? "")).rejects.toThrow();

    const editableRoot = await makeRepo();
    const edited = await runClaude(
      {
        prompt: "Edit",
        cwd: editableRoot,
        mode: "edit",
        worktree: { mode: "ephemeral" },
      },
      {
        execute: async () => success(),
        retryOptions: { sleep: async () => undefined },
      },
    );
    expect(edited.worktree?.removed).toBe(false);
    await expect(access(edited.worktree?.path ?? "")).resolves.toBeUndefined();
    expect(
      edited.warnings.some((warning) => warning.code === "W_WORKTREE_RETAINED"),
    ).toBe(true);
  });
});

const live = process.env.CODEX_CLAUDE_AGENT_LIVE === "1" ? it : it.skip;
live("runs a trivial live read-only prompt", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const root = await makeRepo();
  const result = await runClaude({
    prompt: "Reply with exactly: live-ok",
    cwd: root,
    maxTurns: 2,
    maxBudgetUsd: 0.2,
  });
  expect(result.ok).toBe(true);
  expect(result.result).toContain("live-ok");
});
