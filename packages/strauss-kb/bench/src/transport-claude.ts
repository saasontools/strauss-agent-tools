import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ANSWER_TOOL_SCHEMA, parseAnswer } from "./prompt.js";
import type { BenchRequest, BenchResponse, Transport } from "./transport.js";

const execFileAsync = promisify(execFileCallback);

/** The one thing the transport needs from the operating system. Injectable so
 * the dry-run suite can assert on the argv without a Claude Code install. */
export type ExecFile = (
  file: string,
  args: readonly string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
    maxBuffer?: number;
  },
) => Promise<{ stdout: string; stderr: string }>;

/** One call's ceiling, in dollars. A runaway turn cannot outspend it. */
export const MAX_BUDGET_USD = 0.2;
/** Per call. A cell that hangs is an errored cell, not a stalled run. */
export const CALL_TIMEOUT_MS = 120_000;
/** A shared subscription is not a load test. */
export const DEFAULT_CLAUDE_CONCURRENCY = 2;
const MAX_BUFFER = 16 * 1024 * 1024;

/**
 * `--effort low` alone still spends thinking tokens (measured: 93 on a
 * two-token question), and the CLI has no flag that turns thinking off. This
 * environment variable does, and the run records the total so a reader can
 * check rather than trust it.
 */
export const NO_THINKING_ENV = { MAX_THINKING_TOKENS: "0" } as const;

export type ClaudeTransportOptions = {
  execFile?: ExecFile;
  /** An empty directory, so no `CLAUDE.md` on the way to `/` joins the prompt. */
  cwd?: string;
  concurrency?: number;
  timeoutMs?: number;
  maxBudgetUsd?: number;
  env?: NodeJS.ProcessEnv;
};

/** The subset of the CLI's result JSON this transport reads. */
type ClaudeResult = {
  is_error?: boolean;
  result?: unknown;
  structured_output?: unknown;
  usage?: {
    input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    output_tokens?: number;
    output_tokens_details?: { thinking_tokens?: number };
  };
  modelUsage?: Record<string, { thinkingTokens?: number }>;
};

/** The argv for one cell. Exported so a test can assert on it directly. */
export function claudeArgs(
  request: BenchRequest,
  maxBudgetUsd = MAX_BUDGET_USD,
): string[] {
  return [
    "-p",
    "--no-session-persistence",
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--model",
    request.model,
    // No tools: the bundle is the only source, exactly as on the API transport.
    "--tools",
    "",
    "--effort",
    "low",
    "--max-budget-usd",
    String(maxBudgetUsd),
    // The bundle rides in the system prompt because Claude Code caches that
    // block; the question is the turn.
    "--system-prompt",
    `${request.system}\n\n${request.bundle}`,
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(ANSWER_TOOL_SCHEMA),
    request.question,
  ];
}

/**
 * Runs each cell through the locally installed Claude Code CLI, on whatever
 * account `claude` is logged in as. No `ANTHROPIC_API_KEY`.
 *
 * `--bare` is deliberately absent: it makes the CLI read `ANTHROPIC_API_KEY`
 * and never the OAuth login, which is the whole point of this transport.
 *
 * The contract matches the API transport: a throw is an errored cell that
 * leaves the denominator, while a well-formed reply with no usable answer is a
 * real failure to answer and is scored wrong.
 */
export function claudeCodeTransport(
  options: ClaudeTransportOptions = {},
): Transport {
  const {
    execFile = execFileAsync as unknown as ExecFile,
    concurrency = DEFAULT_CLAUDE_CONCURRENCY,
    timeoutMs = CALL_TIMEOUT_MS,
    maxBudgetUsd = MAX_BUDGET_USD,
    env = process.env,
  } = options;

  let cwdPromise: Promise<string> | null = null;
  const emptyCwd = async (): Promise<string> => {
    if (options.cwd) return options.cwd;
    cwdPromise ??= mkdtemp(join(tmpdir(), "kb-bench-"));
    return cwdPromise;
  };

  const call = async (request: BenchRequest): Promise<BenchResponse> => {
    const { stdout } = await execFile(
      "claude",
      claudeArgs(request, maxBudgetUsd),
      {
        cwd: await emptyCwd(),
        env: { ...env, ...NO_THINKING_ENV },
        timeout: timeoutMs,
        maxBuffer: MAX_BUFFER,
      },
    );
    return readResult(stdout);
  };

  return limitConcurrency(call, concurrency);
}

/** Parses one `--output-format json` payload into a cell. */
export function readResult(stdout: string): BenchResponse {
  let parsed: ClaudeResult;
  try {
    parsed = JSON.parse(stdout) as ClaudeResult;
  } catch {
    throw new Error(
      `claude returned output that is not JSON: ${stdout.slice(0, 200)}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("claude returned JSON that is not an object");
  }
  if (parsed.is_error) {
    const detail =
      typeof parsed.result === "string" ? parsed.result : "no detail given";
    throw new Error(`claude reported an error: ${detail}`);
  }

  const usage = parsed.usage ?? {};
  const modelThinking = Object.values(parsed.modelUsage ?? {}).map(
    (entry) => entry?.thinkingTokens ?? 0,
  );
  return {
    answer: parseAnswer(parsed.structured_output),
    usage: {
      inputTokens: usage.input_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      thinkingTokens:
        usage.output_tokens_details?.thinking_tokens ??
        // The dated and aliased entries repeat one call, so sum would double it.
        (modelThinking.length ? Math.max(...modelThinking) : 0),
    },
  };
}

/** Caps in-flight calls, whatever the runner's own worker count is. */
export function limitConcurrency(
  transport: Transport,
  limit: number,
): Transport {
  const bound = Math.max(1, limit);
  let running = 0;
  const waiting: Array<() => void> = [];

  // The slot is claimed before the await and handed straight to the next
  // waiter on release, so no caller can slip through the gap.
  const acquire = (): Promise<void> => {
    if (running < bound) {
      running += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => waiting.push(resolve));
  };
  const release = (): void => {
    const next = waiting.shift();
    if (next) next();
    else running -= 1;
  };

  return async (request) => {
    await acquire();
    try {
      return await transport(request);
    } finally {
      release();
    }
  };
}

export class ClaudePreflightError extends Error {}

/**
 * Refuses to start a run the CLI cannot serve: no `claude` on the PATH, or a
 * login that has lapsed. Both are cheaper to learn now than 240 errored cells
 * later. Returns the CLI version, which the result files record.
 */
export async function preflightClaude(
  options: ClaudeTransportOptions = {},
): Promise<string> {
  const execFile = options.execFile ?? (execFileAsync as unknown as ExecFile);
  let version: string;
  try {
    const { stdout } = await execFile("claude", ["--version"], {
      timeout: 30_000,
      maxBuffer: MAX_BUFFER,
    });
    // `claude --version` prints "2.1.259 (Claude Code)"; keep the number.
    version = stdout.trim().split(/\s+/)[0] ?? stdout.trim();
  } catch (error) {
    throw new ClaudePreflightError(
      "could not run `claude --version`. Install Claude Code, or run with " +
        `--transport=api. (${error instanceof Error ? error.message : String(error)})`,
    );
  }

  const ping = claudeCodeTransport({ ...options, concurrency: 1 });
  try {
    await ping({
      model: "claude-haiku-4-5",
      system: "Answer from the note below.",
      bundle: "### note.ping\n\nThe ping value is ok.",
      question: "What is the ping value? Answer with the structured output.",
      maxTokens: 64,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ClaudePreflightError(
      /not logged in|invalid api key|authentication/i.test(message)
        ? "claude is installed but not logged in. Run `claude` and `/login`, " +
            "then re-run the bench."
        : `the claude preflight call failed: ${message}`,
    );
  }
  return version;
}
