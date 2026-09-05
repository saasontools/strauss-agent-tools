import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs } from "./cli.js";
import { runBench } from "./runner.js";
import { CORE_TASKS } from "./tasks.js";
import { loadBundle } from "./bundle.js";
import {
  ClaudePreflightError,
  DEFAULT_CLAUDE_CONCURRENCY,
  childEnv,
  claudeArgs,
  claudeCodeTransport,
  limitConcurrency,
  preflightClaude,
} from "./transport-claude.js";
import type { ExecFile } from "./transport-claude.js";
import { EMPTY_USAGE } from "./transport.js";
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
  const args = claudeArgs(request, "/tmp/kb-bench-1/system-prompt-1.md");

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

  it("caps one call's spend and passes the system prompt by path", () => {
    expect(args[args.indexOf("--max-budget-usd") + 1]).toBe("0.2");
    expect(args).not.toContain("--system-prompt");
    expect(args[args.indexOf("--system-prompt-file") + 1]).toBe(
      "/tmp/kb-bench-1/system-prompt-1.md",
    );
  });

  it("ends the flags before the question, whatever it starts with", () => {
    expect(args.at(-1)).toBe(request.question);
    expect(args.at(-2)).toBe("--");
  });
});

describe("childEnv", () => {
  it("drops every key that would redirect the call off the CLI login", () => {
    const env = childEnv({
      PATH: "/usr/bin",
      ANTHROPIC_API_KEY: "sk-ant-1",
      ANTHROPIC_AUTH_TOKEN: "tok",
      ANTHROPIC_BASE_URL: "https://proxy.example",
      ANTHROPIC_MODEL: "claude-opus-4",
      ANTHROPIC_SMALL_FAST_MODEL: "claude-haiku-4",
      CLAUDE_CODE_USE_BEDROCK: "1",
      CLAUDE_CODE_MAX_OUTPUT_TOKENS: "64",
    });

    expect(Object.keys(env).sort()).toEqual(["MAX_THINKING_TOKENS", "PATH"]);
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

  it("runs with thinking disabled and no API key in the child environment", async () => {
    let seen: NodeJS.ProcessEnv | undefined;
    const exec = (async (_file, _args, options) => {
      seen = options.env;
      return { stdout: payload(), stderr: "" };
    }) as ExecFile;
    const transport = claudeCodeTransport({
      execFile: exec,
      cwd: "/tmp",
      env: { PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-ant-1" },
    });
    await transport(request);
    await transport.dispose();

    expect(seen?.MAX_THINKING_TOKENS).toBe("0");
    expect(seen).not.toHaveProperty("ANTHROPIC_API_KEY");
  });

  it("writes the bundle to a file before the spawn and unlinks it after", async () => {
    let promptPath: string | undefined;
    let contents: string | undefined;
    const exec = (async (_file, args) => {
      promptPath = args[args.indexOf("--system-prompt-file") + 1];
      contents = await readFile(promptPath as string, "utf8");
      return { stdout: payload(), stderr: "" };
    }) as ExecFile;

    const transport = claudeCodeTransport({ execFile: exec });
    await transport(request);

    expect(contents).toContain("# Project notes");
    expect(contents).toContain("system");
    await expect(access(promptPath as string)).rejects.toThrow();

    const dir = join(promptPath as string, "..");
    expect(await readdir(dir)).toEqual([]);
    await transport.dispose();
    await expect(access(dir)).rejects.toThrow();
  });

  it("keeps one temp directory across cells", async () => {
    const seen: string[] = [];
    const exec = (async (_file, args) => {
      seen.push(args[args.indexOf("--system-prompt-file") + 1] as string);
      return { stdout: payload(), stderr: "" };
    }) as ExecFile;

    const transport = claudeCodeTransport({ execFile: exec });
    await transport(request);
    await transport(request);
    await transport.dispose();

    expect(new Set(seen).size).toBe(2);
    expect(join(seen[0] as string, "..")).toBe(join(seen[1] as string, ".."));
  });

  it("scores a non-zero exit that still printed a result payload", async () => {
    const exec = (async () => {
      throw Object.assign(new Error("Command failed"), {
        code: 1,
        stdout: payload({ structured_output: null }),
        stderr: "",
      });
    }) as ExecFile;
    const transport = claudeCodeTransport({ execFile: exec, cwd: "/tmp" });

    await expect(transport(request)).resolves.toMatchObject({ answer: null });
    await transport.dispose();
  });

  it("errors a non-zero exit whose stdout is not JSON, with the code and stderr", async () => {
    const exec = (async () => {
      throw Object.assign(new Error("Command failed"), {
        code: 127,
        stdout: "",
        stderr: "claude: command not found",
      });
    }) as ExecFile;
    const transport = claudeCodeTransport({ execFile: exec, cwd: "/tmp" });

    await expect(transport(request)).rejects.toThrow(
      /exited 127.*command not found/s,
    );
    await transport.dispose();
  });

  it("reports no output cap, because the CLI has no flag for one", async () => {
    const transport = claudeCodeTransport({
      execFile: fakeExec(payload()),
      cwd: "/tmp",
    });
    await expect(transport(request)).resolves.toMatchObject({
      maxTokens: null,
    });
    await transport.dispose();
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

describe("preflightClaude", () => {
  const version: ExecFile = async () => ({
    stdout: "2.1.259 (Claude Code)\n",
    stderr: "",
  });

  it("pings with the run's own first model through the run's transport", async () => {
    let model: string | undefined;
    const transport = async (pinged: BenchRequest) => {
      model = pinged.model;
      return { answer: null, usage: EMPTY_USAGE };
    };

    await expect(
      preflightClaude({
        execFile: version,
        transport,
        model: "claude-opus-4-5",
        platform: "darwin",
      }),
    ).resolves.toBe("2.1.259");
    expect(model).toBe("claude-opus-4-5");
  });

  it("prints the CLI's own result text after the generic message", async () => {
    const transport = claudeCodeTransport({
      execFile: fakeExec(
        payload({ is_error: true, result: "Credit balance is too low" }),
      ),
      cwd: "/tmp",
    });

    await expect(
      preflightClaude({
        execFile: version,
        transport,
        model: "claude-haiku-4-5",
        platform: "darwin",
      }),
    ).rejects.toThrow(/Credit balance is too low/);
    await transport.dispose();
  });

  it("refuses on Windows, where the CLI cannot be spawned without a shell", async () => {
    await expect(
      preflightClaude({
        execFile: version,
        transport: async () => ({ answer: null, usage: EMPTY_USAGE }),
        model: "claude-haiku-4-5",
        platform: "win32",
      }),
    ).rejects.toThrow(ClaudePreflightError);
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
