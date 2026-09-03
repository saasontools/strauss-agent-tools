import { describe, expect, it } from "vitest";
import { parseArgs } from "./cli.js";
import { runBench } from "./runner.js";
import { CORE_TASKS } from "./tasks.js";
import { loadBundle } from "./bundle.js";
import {
  DEFAULT_CLAUDE_CONCURRENCY,
  claudeArgs,
  claudeCodeTransport,
  limitConcurrency,
} from "./transport-claude.js";
import type { ExecFile } from "./transport-claude.js";
import type { BenchRequest } from "./transport.js";

const request: BenchRequest = {
  model: "claude-sonnet-5",
  system: "system",
  bundle: "# Project notes",
  question: "Which queue backend is current?",
  maxTokens: 2000,
};

const payload = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    is_error: false,
    structured_output: {
      answer: "NATS JetStream.",
      value: "NATS JetStream",
      actionable: true,
      concept_ids: ["decision.jetstream-queue-backend"],
    },
    usage: {
      input_tokens: 12,
      cache_creation_input_tokens: 3400,
      cache_read_input_tokens: 0,
      output_tokens: 158,
      output_tokens_details: { thinking_tokens: 0 },
    },
    modelUsage: { "claude-sonnet-5": { thinkingTokens: 0 } },
    ...overrides,
  });

/** An `execFile` that answers from a canned stdout instead of a subprocess. */
const fakeExec =
  (stdout: string): ExecFile =>
  async () => ({ stdout, stderr: "" });

describe("claudeArgs", () => {
  const args = claudeArgs(request);

  it("keeps the model toolless, MCP-less, and settings-free", () => {
    expect(args).toContain("--strict-mcp-config");
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("");
  });

  it("forces the answer shape with --json-schema", () => {
    const schema = JSON.parse(args[args.indexOf("--json-schema") + 1] ?? "{}");
    expect(schema.required).toEqual([
      "answer",
      "value",
      "actionable",
      "concept_ids",
    ]);
  });

  it("never passes --bare, which would skip the OAuth login", () => {
    expect(args).not.toContain("--bare");
  });

  it("caps one call's spend and puts the bundle in the system prompt", () => {
    expect(args[args.indexOf("--max-budget-usd") + 1]).toBe("0.2");
    expect(args[args.indexOf("--system-prompt") + 1]).toContain(
      "# Project notes",
    );
    expect(args.at(-1)).toBe(request.question);
  });
});

describe("claudeCodeTransport", () => {
  it("parses a success payload into a scored answer and its usage", async () => {
    const exec = fakeExec(payload());
    const transport = claudeCodeTransport({ execFile: exec, cwd: "/tmp" });
    const response = await transport(request);

    expect(response.answer?.value).toBe("NATS JetStream");
    expect(response.usage.cacheWriteTokens).toBe(3400);
    expect(response.usage.thinkingTokens).toBe(0);
  });

  it("runs with thinking disabled in the child environment", async () => {
    let seen: NodeJS.ProcessEnv | undefined;
    const exec = (async (_file, _args, options) => {
      seen = options.env;
      return { stdout: payload(), stderr: "" };
    }) as ExecFile;
    await claudeCodeTransport({ execFile: exec, cwd: "/tmp" })(request);
    expect(seen?.MAX_THINKING_TOKENS).toBe("0");
  });

  it("throws on an is_error payload, so the cell leaves the denominator", async () => {
    const exec = fakeExec(
      payload({
        is_error: true,
        result: "Not logged in",
        structured_output: null,
      }),
    );
    const transport = claudeCodeTransport({ execFile: exec, cwd: "/tmp" });
    await expect(transport(request)).rejects.toThrow(/Not logged in/);
  });

  it("throws on stdout that is not JSON", async () => {
    const transport = claudeCodeTransport({
      execFile: fakeExec("command not found: claude"),
      cwd: "/tmp",
    });
    await expect(transport(request)).rejects.toThrow(/not JSON/);
  });

  it("scores a missing structured_output wrong rather than errored", async () => {
    const exec = fakeExec(payload({ structured_output: null }));
    const records = await loadBundle();
    const run = await runBench({
      records,
      tasks: CORE_TASKS.slice(0, 1),
      arms: ["A"],
      models: ["claude-sonnet-5"],
      transport: claudeCodeTransport({ execFile: exec, cwd: "/tmp" }),
      transportId: "claude",
      transportVersion: "2.1.259",
      bootstrapIterations: 50,
    });

    expect(run.totals.errored).toBe(0);
    expect(run.cells[0]?.scored.correct).toBe(false);
    expect(run.transport).toBe("claude");
    expect(run.transportVersion).toBe("2.1.259");
  });

  it("holds in-flight calls to the bound however hard the runner pushes", async () => {
    let running = 0;
    let peak = 0;
    const release: Array<() => void> = [];
    const slow = limitConcurrency(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise<void>((resolve) => release.push(resolve));
      running -= 1;
      return {
        answer: null,
        usage: {
          inputTokens: 0,
          cacheWriteTokens: 0,
          cacheReadTokens: 0,
          outputTokens: 0,
        },
      };
    }, DEFAULT_CLAUDE_CONCURRENCY);

    const calls = Array.from({ length: 8 }, () => slow(request));
    for (let drained = 0; drained < 8; drained += 1) {
      await Promise.resolve();
      release.shift()?.();
      await Promise.resolve();
    }
    while (release.length) release.shift()?.();
    await Promise.all(calls);

    expect(peak).toBe(DEFAULT_CLAUDE_CONCURRENCY);
  });
});

describe("--transport", () => {
  it("defaults to the API and drops concurrency for the shared login", () => {
    expect(parseArgs([]).transport).toBe("api");
    expect(parseArgs([]).concurrency).toBe(4);
    expect(parseArgs(["--transport=claude"]).concurrency).toBe(
      DEFAULT_CLAUDE_CONCURRENCY,
    );
  });

  it("rejects a transport it cannot run", () => {
    expect(() => parseArgs(["--transport=cli"])).toThrow(/unknown transport/);
  });
});
