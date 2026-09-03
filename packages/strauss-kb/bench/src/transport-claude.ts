import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
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
/** How much of a failed call's stderr an errored cell carries. */
const STDERR_TAIL = 400;

/**
 * `--effort low` alone still spends thinking tokens (measured: 93 on a
 * two-token question), and the CLI has no flag that turns thinking off. This
 * environment variable does, and the run records the total so a reader can
 * check rather than trust it.
 */
export const NO_THINKING_ENV = { MAX_THINKING_TOKENS: "0" } as const;

/**
 * Variables that would silently move the run to another account, endpoint, or
 * model. The whole point of this transport is the CLI's own OAuth login and
 * the model `--model` names, so the child never sees them.
 */
export const STRIPPED_ENV_KEYS: readonly string[] = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_SMALL_FAST_MODEL",
];

/** Every `CLAUDE_CODE_*` knob goes too: they reconfigure the CLI itself. */
export const STRIPPED_ENV_PREFIX = "CLAUDE_CODE_";

/** The environment one cell runs in: the parent's, minus the overrides. */
export function childEnv(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    if (STRIPPED_ENV_KEYS.includes(key)) continue;
    if (key.startsWith(STRIPPED_ENV_PREFIX)) continue;
    env[key] = value;
  }
  return { ...env, ...NO_THINKING_ENV };
}

export type ClaudeTransportOptions = {
  execFile?: ExecFile;
  /** An empty directory, so no `CLAUDE.md` on the way to `/` joins the prompt. */
  cwd?: string;
  concurrency?: number;
  timeoutMs?: number;
  maxBudgetUsd?: number;
  env?: NodeJS.ProcessEnv;
  /** Injectable so the POSIX-only check is testable off Windows. */
  platform?: NodeJS.Platform;
};

/** A transport that owns a temp directory, so the caller can give it back. */
export type DisposableTransport = Transport & { dispose(): Promise<void> };

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

/**
 * A call the CLI answered but did not complete. `resultText` is the CLI's own
 * `result` string, kept verbatim so preflight can print it rather than
 * paraphrase it.
 */
export class ClaudeCallError extends Error {
  constructor(
    message: string,
    readonly resultText: string | null = null,
  ) {
    super(message);
    this.name = "ClaudeCallError";
  }
}

/**
 * The argv for one cell. Exported so a test can assert on it directly.
 *
 * The system prompt goes in by path: the rendered bundle is tens of kilobytes,
 * which is argv-length territory on some systems, and a file keeps the whole
 * bundle out of the process table.
 */
export function claudeArgs(
  request: BenchRequest,
  systemPromptPath: string,
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
    "--system-prompt-file",
    systemPromptPath,
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(ANSWER_TOOL_SCHEMA),
    // A question that begins with a dash is a question, not a flag.
    "--",
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
 * POSIX only. On Windows the binary is `claude.cmd`, which neither `execFile`
 * nor `spawn` will start without a shell, and putting a bundle-sized prompt
 * through a shell is not worth the quoting. `preflightClaude` refuses there.
 *
 * The contract matches the API transport: a throw is an errored cell that
 * leaves the denominator, while a well-formed reply with no usable answer is a
 * real failure to answer and is scored wrong.
 */
export function claudeCodeTransport(
  options: ClaudeTransportOptions = {},
): DisposableTransport {
  const {
    execFile = execFileAsync as unknown as ExecFile,
    concurrency = DEFAULT_CLAUDE_CONCURRENCY,
    timeoutMs = CALL_TIMEOUT_MS,
    maxBudgetUsd = MAX_BUDGET_USD,
    env = process.env,
  } = options;

  // One directory per transport instance, made on the first cell and reused:
  // it holds each cell's system-prompt file, and doubles as the empty cwd.
  let workDirPromise: Promise<string> | null = null;
  const workDir = async (): Promise<string> => {
    workDirPromise ??= mkdtemp(join(tmpdir(), "kb-bench-"));
    return workDirPromise;
  };

  let cell = 0;
  const call = async (request: BenchRequest): Promise<BenchResponse> => {
    const dir = await workDir();
    // Unique per cell: concurrent calls share the directory, not the file.
    cell += 1;
    const systemPromptPath = join(dir, `system-prompt-${cell}.md`);
    await writeFile(
      systemPromptPath,
      `${request.system}\n\n${request.bundle}`,
      "utf8",
    );

    try {
      return await run(request, systemPromptPath);
    } finally {
      await unlink(systemPromptPath).catch(() => {});
    }
  };

  const run = async (
    request: BenchRequest,
    systemPromptPath: string,
  ): Promise<BenchResponse> => {
    let stdout: string;
    try {
      ({ stdout } = await execFile(
        "claude",
        claudeArgs(request, systemPromptPath, maxBudgetUsd),
        {
          cwd: options.cwd ?? (await workDir()),
          env: childEnv(env),
          timeout: timeoutMs,
          maxBuffer: MAX_BUFFER,
        },
      ));
    } catch (error) {
      // A non-zero exit still prints the result JSON on stdout: budget
      // exhausted, a refused turn, a schema the model never filled. That is a
      // scoreable answer, not a broken call, so it takes the normal path.
      const failure = error as {
        stdout?: unknown;
        stderr?: unknown;
        code?: unknown;
      };
      const out = typeof failure.stdout === "string" ? failure.stdout : "";
      if (isJson(out)) return readResult(out);
      const stderr =
        typeof failure.stderr === "string" ? failure.stderr.trim() : "";
      throw new ClaudeCallError(
        `claude exited ${String(failure.code ?? "with no code")} without JSON on stdout` +
          (stderr ? `: ${stderr.slice(-STDERR_TAIL)}` : ""),
      );
    }
    return readResult(stdout);
  };

  const transport = limitConcurrency(call, concurrency) as DisposableTransport;
  transport.dispose = async (): Promise<void> => {
    const pending = workDirPromise;
    workDirPromise = null;
    if (!pending) return;
    await rm(await pending, { recursive: true, force: true }).catch(() => {});
  };
  return transport;
}

const isJson = (text: string): boolean => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

/** Parses one `--output-format json` payload into a cell. */
export function readResult(stdout: string): BenchResponse {
  let parsed: ClaudeResult;
  try {
    parsed = JSON.parse(stdout) as ClaudeResult;
  } catch {
    throw new ClaudeCallError(
      `claude returned output that is not JSON: ${stdout.slice(0, 200)}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new ClaudeCallError("claude returned JSON that is not an object");
  }
  const resultText = typeof parsed.result === "string" ? parsed.result : null;
  if (parsed.is_error) {
    throw new ClaudeCallError(
      `claude reported an error: ${resultText ?? "no detail given"}`,
      resultText,
    );
  }

  const usage = parsed.usage ?? {};
  const modelThinking = Object.values(parsed.modelUsage ?? {}).map(
    (entry) => entry?.thinkingTokens ?? 0,
  );
  return {
    answer: parseAnswer(parsed.structured_output),
    // The CLI has no flag that caps output tokens, so no cap was applied.
    maxTokens: null,
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

export type PreflightOptions = {
  execFile?: ExecFile;
  /** The run's own transport, so preflight opens no second temp directory. */
  transport: Transport;
  /** The first model the run will use. Pinging another proves nothing. */
  model: string;
  platform?: NodeJS.Platform;
};

/**
 * Refuses to start a run the CLI cannot serve: the wrong platform, no `claude`
 * on the PATH, or a login that has lapsed. All three are cheaper to learn now
 * than 240 errored cells later. Returns the CLI version, which the result files
 * record.
 */
export async function preflightClaude(
  options: PreflightOptions,
): Promise<string> {
  const execFile = options.execFile ?? (execFileAsync as unknown as ExecFile);
  if ((options.platform ?? process.platform) === "win32") {
    throw new ClaudePreflightError(
      "--transport=claude is POSIX-only: on Windows the CLI is `claude.cmd`, " +
        "which cannot be spawned without a shell. Use --transport=api.",
    );
  }

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

  try {
    await options.transport({
      model: options.model,
      system: "Answer from the note below.",
      bundle: "### note.ping\n\nThe ping value is ok.",
      question: "What is the ping value? Answer with the structured output.",
      maxTokens: 64,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const verbatim =
      error instanceof ClaudeCallError && error.resultText
        ? `\n${error.resultText}`
        : "";
    throw new ClaudePreflightError(
      (/not logged in|invalid api key|authentication/i.test(message)
        ? "claude is installed but not logged in. Run `claude` and `/login`, " +
          "then re-run the bench."
        : `the claude preflight call failed: ${message}`) + verbatim,
    );
  }
  return version;
}
