#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { open, readFile, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { setupCodex } from "./diagnostics.js";
import { exitCodeFor, RunnerError, toRunnerError } from "./errors.js";
import {
  assertJobOwner,
  cancelJob,
  failJob,
  listJobs,
  markResultRead,
  ownerSessionId,
  readJob,
  reconcileJob,
  resolveJobPaths,
  updateJob,
} from "./jobs/index.js";
import { renderMarkdown, renderOutput, type OutputFormat } from "./render.js";
import { runClaude } from "./run.js";
import {
  RunRequestSchema,
  RunResultSchema,
  type JobRecord,
  type RunRequestInput,
  type RunResult,
} from "./schema.js";
import { resolveGitRoot } from "./worktree.js";

interface ParsedRun {
  request: RunRequestInput;
  format: OutputFormat;
  stream: boolean;
  foreground: boolean;
  jobId?: string;
  noCache: boolean;
}

function takeValue(
  args: string[],
  index: number,
  flag: string,
): [string, number] {
  const value = args[index + 1];
  if (!value || value.startsWith("--"))
    throw new RunnerError("E_INVALID_REQUEST", `${flag} requires a value.`);
  return [value, index + 1];
}

function parseNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    throw new RunnerError("E_INVALID_REQUEST", `${flag} requires a number.`);
  return parsed;
}

/** Below this, a bare number is likelier a unit slip than an intent. */
const SUSPICIOUS_BARE_MS = 60_000;

function parseDuration(value: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(value);
  if (!match)
    throw new RunnerError("E_INVALID_REQUEST", `Invalid timeout: ${value}`);
  const amount = Number(match[1]);
  if (match[2] === undefined && amount > 0 && amount < SUSPICIOUS_BARE_MS) {
    // `--timeout 1800` meaning half an hour is a mistake people actually make:
    // it buys 1.8 seconds, and the run dies before Claude answers anything.
    // Still honoured — the unit is documented and someone may mean it — but
    // not silently. Stderr, so the --json contract on stdout is untouched.
    process.stderr.write(
      `Note: --timeout ${value} is ${(amount / 1000).toFixed(1)}s. Bare numbers are milliseconds; write ${value}s or 30m for longer.\n`,
    );
  }
  const multiplier =
    match[2] === "h"
      ? 3_600_000
      : match[2] === "m"
        ? 60_000
        : match[2] === "s"
          ? 1_000
          : 1;
  return Math.floor(amount * multiplier);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  return Buffer.concat(chunks).toString("utf8");
}

export async function resolvePrompt(options: {
  prompt?: string;
  freeText?: string[];
  promptFile?: string;
  stdin?: string;
  cwd?: string;
}): Promise<string> {
  if (options.prompt?.trim()) return options.prompt.trim();
  if (options.freeText?.join(" ").trim())
    return options.freeText.join(" ").trim();
  if (options.promptFile) {
    const content = await readFile(
      path.resolve(options.cwd ?? process.cwd(), options.promptFile),
      "utf8",
    );
    if (content.trim()) return content.trim();
  }
  if (options.stdin?.trim()) return options.stdin.trim();
  throw new RunnerError("E_INVALID_REQUEST", "A prompt is required.", {
    hint: "Pass free text, --prompt, --prompt-file, or pipe a prompt on stdin.",
  });
}

export async function parseRunArgs(
  args: string[],
  stdin?: string,
): Promise<ParsedRun> {
  const request: Record<string, unknown> = {};
  const worktree: Record<string, unknown> = {};
  const retry: Record<string, number> = {};
  const freeText: string[] = [];
  const additionalDirectories: string[] = [];
  const allowedTools: string[] = [];
  const settingSources: string[] = [];
  const tags: Record<string, string> = {};
  let prompt: string | undefined;
  let promptFile: string | undefined;
  let schemaFile: string | undefined;
  let format: OutputFormat = "markdown";
  let stream = false;
  let foreground = false;
  let jobId: string | undefined;
  let noCache = false;

  for (let index = 0; index < args.length; index += 1) {
    // Bounded by args.length: every index in this loop is in range, which
    // `noUncheckedIndexedAccess` cannot see.
    const arg = args[index]!;
    if (!arg.startsWith("--")) {
      freeText.push(arg);
      continue;
    }
    let value: string;
    switch (arg) {
      case "--prompt":
        [value, index] = takeValue(args, index, arg);
        prompt = value;
        break;
      case "--prompt-file":
        [value, index] = takeValue(args, index, arg);
        promptFile = value;
        break;
      case "--cwd":
        [value, index] = takeValue(args, index, arg);
        request.cwd = value;
        break;
      case "--worktree":
        [value, index] = takeValue(args, index, arg);
        worktree.mode = value;
        break;
      case "--worktree-path":
        [value, index] = takeValue(args, index, arg);
        worktree.path = value;
        break;
      case "--ref":
        [value, index] = takeValue(args, index, arg);
        worktree.ref = value;
        break;
      case "--branch":
        [value, index] = takeValue(args, index, arg);
        worktree.branch = value;
        break;
      case "--keep-worktree":
        worktree.cleanup = false;
        break;
      case "--edit":
        request.mode = "edit";
        break;
      case "--read-only":
        request.mode = "read-only";
        break;
      case "--allowed-tool":
        [value, index] = takeValue(args, index, arg);
        allowedTools.push(value);
        break;
      case "--additional-directory":
        [value, index] = takeValue(args, index, arg);
        additionalDirectories.push(value);
        break;
      case "--model":
        [value, index] = takeValue(args, index, arg);
        request.model = value;
        break;
      case "--effort":
        [value, index] = takeValue(args, index, arg);
        request.effort = value;
        break;
      case "--max-turns":
        [value, index] = takeValue(args, index, arg);
        request.maxTurns = parseNumber(value, arg);
        break;
      case "--budget":
        [value, index] = takeValue(args, index, arg);
        request.maxBudgetUsd = parseNumber(value, arg);
        break;
      case "--timeout":
        [value, index] = takeValue(args, index, arg);
        request.timeoutMs = parseDuration(value);
        break;
      case "--setting-source":
        [value, index] = takeValue(args, index, arg);
        settingSources.push(value);
        break;
      case "--no-claude-md":
        request.loadClaudeMd = false;
        break;
      case "--agents":
        [value, index] = takeValue(args, index, arg);
        request.agentsFile = value;
        break;
      case "--schema":
        [value, index] = takeValue(args, index, arg);
        schemaFile = value;
        break;
      case "--resume":
        [value, index] = takeValue(args, index, arg);
        request.resume = value;
        break;
      case "--fork":
        request.fork = true;
        break;
      case "--background":
        request.background = true;
        break;
      case "--wait":
      case "--foreground":
        request.background = false;
        foreground = true;
        break;
      case "--tag":
        [value, index] = takeValue(args, index, arg);
        if (!value.includes("="))
          throw new RunnerError(
            "E_INVALID_REQUEST",
            "--tag requires key=value.",
          );
        tags[value.slice(0, value.indexOf("="))] = value.slice(
          value.indexOf("=") + 1,
        );
        break;
      case "--retry-attempts":
        [value, index] = takeValue(args, index, arg);
        retry.maxAttempts = parseNumber(value, arg);
        break;
      case "--retry-base-delay":
        [value, index] = takeValue(args, index, arg);
        retry.baseDelayMs = parseDuration(value);
        break;
      case "--no-git":
        request.noGit = true;
        break;
      case "--allow-detached":
        request.allowDetached = true;
        break;
      case "--share-root":
        request.shareRoot = true;
        break;
      case "--dangerously-allow-all":
        request.dangerouslyAllowAll = true;
        break;
      case "--format":
        [value, index] = takeValue(args, index, arg);
        if (!["json", "markdown", "text"].includes(value))
          throw new RunnerError(
            "E_INVALID_REQUEST",
            `Invalid format: ${value}`,
          );
        format = value as OutputFormat;
        break;
      case "--json":
        format = "json";
        break;
      case "--stream":
        stream = true;
        break;
      case "--job-id":
        [value, index] = takeValue(args, index, arg);
        jobId = value;
        break;
      case "--no-cache":
        noCache = true;
        break;
      case "--request-file": {
        [value, index] = takeValue(args, index, arg);
        const stored = JSON.parse(await readFile(value, "utf8")) as Record<
          string,
          unknown
        >;
        Object.assign(request, stored);
        break;
      }
      default:
        throw new RunnerError("E_INVALID_REQUEST", `Unknown flag: ${arg}`);
    }
  }
  const cwd = typeof request.cwd === "string" ? request.cwd : process.cwd();
  request.prompt = await resolvePrompt({
    prompt: typeof request.prompt === "string" ? request.prompt : prompt,
    freeText,
    promptFile,
    stdin:
      stdin ??
      (!process.stdin.isTTY &&
      !request.prompt &&
      !promptFile &&
      freeText.length === 0
        ? await readStdin()
        : undefined),
    cwd,
  });
  if (Object.keys(worktree).length > 0) request.worktree = worktree;
  if (additionalDirectories.length > 0)
    request.additionalDirectories = additionalDirectories;
  if (allowedTools.length > 0) request.allowedTools = allowedTools;
  if (settingSources.length > 0) request.settingSources = settingSources;
  if (Object.keys(tags).length > 0) request.tags = tags;
  if (Object.keys(retry).length > 0) request.retry = retry;
  if (schemaFile)
    request.outputSchema = JSON.parse(
      await readFile(path.resolve(cwd, schemaFile), "utf8"),
    );
  return {
    request: request as RunRequestInput,
    format,
    stream,
    foreground,
    jobId,
    noCache,
  };
}

async function commandRoot(cwd = process.cwd()): Promise<string> {
  return resolveGitRoot(cwd).catch(() => path.resolve(cwd));
}

function printRunResult(result: RunResult, format: OutputFormat): void {
  const rendered = renderOutput(result, format);
  if (rendered.stdout) process.stdout.write(rendered.stdout);
  if (rendered.stderr) process.stderr.write(rendered.stderr);
  if (!result.ok)
    process.exitCode = exitCodeFor(result.error?.code ?? "E_UNKNOWN");
}

function requestedFormat(args: string[]): OutputFormat {
  if (args.includes("--json")) return "json";
  const index = args.indexOf("--format");
  const value = index >= 0 ? args[index + 1] : undefined;
  return value === "json" || value === "text" || value === "markdown"
    ? value
    : "markdown";
}

async function runCommand(args: string[]): Promise<void> {
  let parsed: ParsedRun;
  try {
    parsed = await parseRunArgs(args);
    const request = RunRequestSchema.parse(parsed.request);
    const result = await runClaude(request, {
      jobId: parsed.jobId,
      backgroundWorker:
        process.env.CODEX_CLAUDE_AGENT_BACKGROUND_WORKER === "1",
      dedicatedProcess: true,
      noDiagnosticsCache: parsed.noCache,
      stream: parsed.stream
        ? (event) => process.stderr.write(`${JSON.stringify(event)}\n`)
        : undefined,
    });
    printRunResult(result, parsed.format);
  } catch (error) {
    const runnerError = toRunnerError(error);
    if (
      process.env.CODEX_CLAUDE_AGENT_BACKGROUND_WORKER === "1" &&
      process.env.CODEX_CLAUDE_AGENT_ROOT &&
      process.env.CODEX_CLAUDE_AGENT_JOB_ID
    ) {
      await failJob(
        process.env.CODEX_CLAUDE_AGENT_ROOT,
        process.env.CODEX_CLAUDE_AGENT_JOB_ID,
        "Claude background worker failed at its command boundary.",
        runnerError,
      ).catch(() => undefined);
    }
    const result = RunResultSchema.parse({
      ok: false,
      jobId: "invalid-request",
      cwd: process.cwd(),
      usage: { turns: 0, durationMs: 0 },
      warnings: [],
      error: {
        code:
          runnerError.code === "E_UNKNOWN"
            ? "E_INVALID_REQUEST"
            : runnerError.code,
        message: runnerError.message,
        hint: runnerError.hint,
        retryable: false,
        attempts: 1,
        cause: runnerError.causeText,
      },
    });
    printRunResult(result, requestedFormat(args));
  }
}

async function statusCommand(args: string[]): Promise<void> {
  const all = args.includes("--all");
  const follow = args.includes("--follow");
  const jobId = args.find((arg) => !arg.startsWith("--"));
  const root = await commandRoot();
  if (jobId) {
    let offset = 0;
    let nextReconcileAt = 0;
    let lastStatus = "";
    let logHandle: FileHandle | undefined;
    try {
      while (true) {
        const shouldReconcile = Date.now() >= nextReconcileAt;
        const stored = await readJob(root, jobId);
        assertJobOwner(stored);
        const job = shouldReconcile ? await reconcileJob(root, stored) : stored;
        if (shouldReconcile) nextReconcileAt = Date.now() + 5_000;
        const status = JSON.stringify(jobStatusSummary(job));
        if (status !== lastStatus) {
          process.stdout.write(`${status}\n`);
          lastStatus = status;
        }
        if (follow) {
          logHandle ??= await open(
            resolveJobPaths(root, jobId).logPath,
            "r",
          ).catch(() => undefined);
          if (logHandle) {
            const buffer = Buffer.allocUnsafe(64 * 1024);
            while (true) {
              const { bytesRead } = await logHandle.read(
                buffer,
                0,
                buffer.length,
                offset,
              );
              if (bytesRead === 0) break;
              process.stdout.write(buffer.subarray(0, bytesRead));
              offset += bytesRead;
            }
          }
        }
        if (!follow || ["completed", "failed", "cancelled"].includes(job.state))
          return;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } finally {
      await logHandle?.close();
    }
  }
  const owner = ownerSessionId();
  if (!all && !owner) {
    throw new RunnerError(
      "E_INVALID_REQUEST",
      "Session identity is unavailable; use status --all to list job metadata.",
    );
  }
  const jobs = await listJobs(root, {
    ownerSessionId: all ? undefined : owner,
  });
  if (jobs.length === 0) {
    process.stdout.write("No Claude jobs found.\n");
    return;
  }
  process.stdout.write("| Job | State | Updated | Tags |\n|---|---|---|---|\n");
  for (const job of jobs) {
    process.stdout.write(
      `| ${job.jobId} | ${job.state} | ${job.updatedAt} | ${JSON.stringify(job.tags ?? {})} |\n`,
    );
  }
}

export function jobStatusSummary(
  job: JobRecord,
): Omit<
  JobRecord,
  | "request"
  | "repoRoot"
  | "ownerSessionId"
  | "pid"
  | "processIdentity"
  | "result"
  | "tags"
> {
  return {
    version: job.version,
    jobId: job.jobId,
    state: job.state,
    unread: job.unread,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    notifiedAt: job.notifiedAt,
  };
}

async function resultCommand(args: string[]): Promise<void> {
  const requested = args.find((arg) => !arg.startsWith("--"));
  const root = await commandRoot();
  const owner = ownerSessionId();
  if (!requested && !owner) {
    throw new RunnerError(
      "E_INVALID_REQUEST",
      "Session identity is unavailable; result requires an explicit job ID.",
    );
  }
  const job = requested
    ? await readJob(root, requested).then(async (stored) => {
        assertJobOwner(stored);
        return reconcileJob(root, stored);
      })
    : (
        await listJobs(root, {
          limit: 20,
          ownerSessionId: owner,
        })
      ).find(
        (candidate) =>
          ["completed", "failed", "cancelled"].includes(candidate.state) &&
          (!owner || candidate.ownerSessionId === owner),
      );
  if (!job)
    throw new RunnerError(
      "E_INVALID_REQUEST",
      "No completed Claude job found.",
    );
  const content = await readFile(
    resolveJobPaths(root, job.jobId).resultPath,
    "utf8",
  ).catch(() => (job.result ? renderMarkdown(job.result) : undefined));
  if (!content)
    throw new RunnerError(
      "E_EXECUTION",
      `Job ${job.jobId} has no result artifact.`,
    );
  process.stdout.write(content);
  await markResultRead(root, job.jobId);
}

async function cancelCommand(args: string[]): Promise<void> {
  const jobId = args.find((arg) => !arg.startsWith("--"));
  if (!jobId)
    throw new RunnerError("E_INVALID_REQUEST", "cancel requires a job ID.");
  const job = await cancelJob(await commandRoot(), jobId);
  process.stdout.write(`${job.jobId}: ${job.state}\n`);
}

async function setupCommand(args: string[]): Promise<void> {
  const root = await commandRoot();
  const setup = await setupCodex(root, args.includes("--no-cache"));
  for (const check of setup.diagnostics.checks) {
    process.stdout.write(
      `${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}${check.fix ? ` — ${check.fix}` : ""}\n`,
    );
  }
  process.stdout.write(
    `${setup.changed ? "Updated" : "Validated"} ${setup.configPath}\n`,
  );
  if (!setup.diagnostics.ok) process.exitCode = 1;
}

async function hookCommand(args: string[]): Promise<void> {
  if (args[0] !== "unread" || process.env.CODEX_CLAUDE_AGENT_NESTED) return;
  const inputText = await readStdin();
  const input = inputText
    ? (JSON.parse(inputText) as Record<string, unknown>)
    : {};
  const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
  const sessionId =
    typeof input.session_id === "string" ? input.session_id : ownerSessionId();
  if (!sessionId) return;
  const root = await commandRoot(cwd);
  const unread = (
    await listJobs(root, {
      limit: 3,
      unreadOnly: true,
      ownerSessionId: sessionId,
      scanLimit: 100,
    })
  ).filter(
    (job) =>
      ["completed", "failed", "cancelled"].includes(job.state) &&
      !job.notifiedAt,
  );
  if (unread.length === 0) return;
  for (const job of unread)
    await updateJob(root, job.jobId, { notifiedAt: new Date().toISOString() });
  process.stdout.write(
    `Claude background work finished: ${unread.map((job) => job.jobId).join(", ")}. Mention it briefly and use \`$claude result <job-id>\` if the user wants the stored output.\n`,
  );
}

const USAGE = `codex-claude-agent — delegate a task to Claude Code

Usage:
  codex-claude-agent run [flags] <prompt>   delegate a task and report the result
  codex-claude-agent status [job-id]        list tracked jobs, or follow one
  codex-claude-agent result <job-id>        print a finished job's stored result
  codex-claude-agent cancel <job-id>        stop a running job
  codex-claude-agent setup                  check the host and update Codex config

Common run flags:
  --read-only | --edit          tool policy; read-only is the default
  --cwd <dir>                   directory the run works in
  --worktree <none|existing|create|ephemeral>
                                run somewhere other than --cwd
  --worktree-path <dir>         required by existing and create
  --timeout <30m|90s|1h>        default 15m; a bare number is milliseconds
  --budget <usd>                default 5
  --max-turns <n>
  --format <markdown|text>      or --json for one RunResult line on stdout
  --background                  track the run as a job instead of waiting

Docs: https://github.com/saasontools/strauss-agent-tools/tree/main/packages/codex-claude-agent
`;

/**
 * `--help` is answered before anything dispatches, for every subcommand.
 *
 * `setup` mutates ~/.codex/config.toml and ignored flags it did not recognise,
 * so `setup --help` — a question — performed the setup, adding a writable root
 * for whatever directory it was asked from. A gesture whose entire purpose is
 * "tell me what this does" must never be the thing that does it.
 */
function wantsHelp(argv: string[]): boolean {
  return argv.some((arg) => arg === "--help" || arg === "-h");
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  if (argv.length === 0 || wantsHelp(argv)) {
    process.stdout.write(USAGE);
    return;
  }
  const [command, ...args] = argv;
  switch (command) {
    case "run":
      await runCommand(args);
      return;
    case "status":
      await statusCommand(args);
      return;
    case "result":
      await resultCommand(args);
      return;
    case "cancel":
      await cancelCommand(args);
      return;
    case "setup":
      await setupCommand(args);
      return;
    case "hook":
      await hookCommand(args);
      return;
    default:
      throw new RunnerError(
        "E_INVALID_REQUEST",
        "Usage: codex-claude-agent run|status|result|cancel|setup",
      );
  }
}

/**
 * Is this file the process entry point?
 *
 * Both sides go through realpath, because npm installs a bin as a symlink
 * (`node_modules/.bin/codex-claude-agent -> ../@scope/pkg/dist/cli.js`) and
 * `process.argv[1]` is then the link, not the target. Comparing the two
 * unresolved made every symlinked invocation — `npm i -g`, `npx`, a local
 * `.bin` — fall through and exit 0 in silence, while `node dist/cli.js` and
 * npm's shell-shim install shape both worked. The CLI shipped that way in
 * 0.1.0 and 0.1.1.
 *
 * The guard itself has to stay: the test suite imports `main` from this
 * module, and without it every import would run the CLI.
 */
function isProcessEntry(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const canonical = (target: string) => {
    try {
      return realpathSync(target);
    } catch {
      return target;
    }
  };
  return (
    canonical(path.resolve(entry)) === canonical(fileURLToPath(import.meta.url))
  );
}

if (isProcessEntry()) {
  void (async () => {
    let telemetry: Awaited<
      ReturnType<(typeof import("./telemetry.js"))["initializeTelemetry"]>
    >;
    try {
      telemetry = await import("./telemetry.js").then((module) =>
        module.initializeTelemetry(),
      );
      await main();
    } catch (error) {
      const runnerError = toRunnerError(error);
      process.stderr.write(
        `${runnerError.code}: ${runnerError.message} ${runnerError.hint}\n`,
      );
      process.exitCode = exitCodeFor(runnerError);
    } finally {
      try {
        await telemetry?.shutdown();
      } catch (error) {
        const runnerError = toRunnerError(error);
        process.stderr.write(
          `${runnerError.code}: ${runnerError.message} ${runnerError.hint}\n`,
        );
        process.exitCode ||= exitCodeFor(runnerError);
      }
    }
  })();
}
