import { spawn } from "node:child_process";
import {
  context,
  propagation,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import { fileURLToPath } from "node:url";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { assertDiagnostics, runDiagnostics } from "./diagnostics.js";
import { RunnerError, toRunnerError } from "./errors.js";
import {
  createJobEventWriter,
  createJob,
  failJob,
  generateJobId,
  getProcessIdentity,
  probeProcessIdentity,
  readJob,
  resolveJobPaths,
  terminateProcessTree,
  transitionJob,
  updateJob,
  writeJobRequest,
  writeJobResult,
} from "./jobs/index.js";
import { withRetry, type RetryOptions } from "./retry.js";
import {
  AgentDefinitionSchema,
  RunRequestSchema,
  RunResultSchema,
  type RunRequest,
  type RunRequestInput,
  type RunResult,
  type StreamEvent,
  type Warning,
} from "./schema.js";
import {
  executeQuery,
  type ExecuteQueryRequest,
  type RawOutcome,
  type SdkEvent,
} from "./sdk.js";
import type { JobEventWriter } from "./jobs/index.js";
import {
  ensureCodexClaudeExcluded,
  resolveGitRoot,
  resolveWorkspace,
  type ResolvedWorkspace,
} from "./worktree.js";

const LARGE_DIFF_STAT_LINES = 200;
const tracer = trace.getTracer("@saasontools/codex-claude-agent");
const applyFormats = addFormats as unknown as (ajv: Ajv2020) => Ajv2020;

export interface RunClaudeOptions {
  jobId?: string;
  backgroundWorker?: boolean;
  dedicatedProcess?: boolean;
  noDiagnosticsCache?: boolean;
  stream?: (event: StreamEvent) => void;
  execute?: typeof executeQuery;
  retryOptions?: Pick<RetryOptions, "random" | "sleep">;
}

function attemptsFrom(error: RunnerError): number {
  const value = (error as RunnerError & { attempts?: unknown }).attempts;
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : 1;
}

function errorForSignal(error: unknown, signal: AbortSignal): RunnerError {
  return signal.aborted && signal.reason instanceof RunnerError
    ? signal.reason
    : toRunnerError(error);
}

async function raceWithSignal<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw signal.reason;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    operation
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

async function storeRoot(
  request: RunRequest,
  signal?: AbortSignal,
): Promise<string> {
  const cwd = await realpath(path.resolve(request.cwd ?? process.cwd())).catch(
    () => path.resolve(request.cwd ?? process.cwd()),
  );
  if (request.noGit) return cwd;
  return resolveGitRoot(cwd, signal);
}

async function loadAgents(request: RunRequest): Promise<RunRequest["agents"]> {
  if (!request.agentsFile) return request.agents;
  const filePath = path.resolve(
    request.cwd ?? process.cwd(),
    request.agentsFile,
  );
  let exported: unknown;
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".json") {
    exported = JSON.parse(await readFile(filePath, "utf8"));
  } else {
    throw new RunnerError(
      "E_INVALID_REQUEST",
      "agentsFile must be a data-only JSON file.",
    );
  }
  const parsed = AgentDefinitionSchema.array().safeParse(exported);
  if (parsed.success) {
    throw new RunnerError(
      "E_INVALID_REQUEST",
      "agentsFile must export a name-to-agent object, not an array.",
    );
  }
  const record = await import("zod").then(({ z }) =>
    z.record(z.string(), AgentDefinitionSchema).safeParse(exported),
  );
  if (!record.success) {
    throw new RunnerError(
      "E_INVALID_REQUEST",
      `Invalid agents file: ${filePath}`,
      { cause: record.error },
    );
  }
  return { ...request.agents, ...record.data };
}

function compileOutputSchema(
  request: RunRequest,
): ValidateFunction<unknown> | undefined {
  if (!request.outputSchema) return undefined;
  try {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    applyFormats(ajv);
    return ajv.compile(request.outputSchema);
  } catch (error) {
    throw new RunnerError(
      "E_INVALID_REQUEST",
      "The supplied output schema is not valid JSON Schema.",
      { cause: error },
    );
  }
}

async function preambleWarnings(
  workspace: ResolvedWorkspace,
  request: RunRequest,
  signal?: AbortSignal,
): Promise<{
  warnings: Warning[];
  prompt: string;
  projectInstructions?: string;
}> {
  const warnings = [...workspace.warnings];
  let prompt = request.prompt;
  let projectInstructions: string | undefined;
  if (request.loadClaudeMd) {
    const candidates = [path.join(workspace.cwd, "CLAUDE.md")];
    if (workspace.repoRoot && workspace.repoRoot !== workspace.cwd)
      candidates.push(path.join(workspace.repoRoot, "CLAUDE.md"));
    const found = await Promise.all(
      candidates.map((candidate) =>
        readFile(candidate, "utf8").catch(() => undefined),
      ),
    );
    const contents = found.filter(
      (content): content is string => content !== undefined,
    );
    if (contents.length === 0) {
      warnings.push({
        code: "W_NO_CLAUDE_MD",
        message:
          "No CLAUDE.md was found in the working directory or repository root.",
        hint: "Add project instructions if Claude needs repository-specific guidance.",
      });
    } else projectInstructions = contents.join("\n\n");
  }
  if (
    workspace.repoRoot &&
    (request.mode === "edit" || /\b(diff|review|change|patch)\b/i.test(prompt))
  ) {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    try {
      const { stdout } = await promisify(execFile)("git", ["diff", "--stat"], {
        cwd: workspace.cwd,
        encoding: "utf8",
        timeout: 30_000,
        signal,
      });
      if (
        stdout.split(/\r?\n/).filter(Boolean).length > LARGE_DIFF_STAT_LINES
      ) {
        warnings.push({
          code: "W_LARGE_DIFF",
          message: `Diff stat exceeds ${LARGE_DIFF_STAT_LINES} lines; the prompt uses compact diff guidance.`,
          hint: "Inspect the change directly with git diff/status instead of asking the host to inline it.",
        });
        prompt = [
          "The repository diff is large. Do not ask the Codex host to inline it. Inspect it directly with git status, git diff --stat, and narrow git diff commands.",
          "",
          prompt,
        ].join("\n");
      }
    } catch {
      // Diff sizing is advisory.
    }
  }
  return { warnings, prompt, projectInstructions };
}

function validateStructured(
  outcome: RawOutcome,
  validator: ValidateFunction<unknown> | undefined,
): RawOutcome {
  if (!validator) return outcome;
  let structured = outcome.structured;
  if (structured === undefined) {
    try {
      structured = JSON.parse(outcome.result);
    } catch (error) {
      throw new RunnerError(
        "E_STRUCTURED_OUTPUT",
        "Claude returned non-JSON structured output.",
        {
          cause: error,
          retryable: true,
          sessionId: outcome.sessionId,
        },
      );
    }
  }
  if (!validator(structured)) {
    throw new RunnerError(
      "E_STRUCTURED_OUTPUT",
      "Claude JSON did not match the supplied schema.",
      {
        cause: JSON.stringify(validator.errors),
        retryable: true,
        sessionId: outcome.sessionId,
      },
    );
  }
  return { ...outcome, structured };
}

function repairPrompt(error: RunnerError): string {
  return [
    "Your previous final JSON did not match the required schema.",
    `Validation problem: ${error.causeText ?? error.message}`,
    "Return only a corrected JSON value matching the original schema. Do not repeat the task or include Markdown.",
  ].join("\n");
}

async function launchBackground(
  request: RunRequest,
  root: string,
  jobId: string,
  signal: AbortSignal,
): Promise<RunResult> {
  let created = false;
  let child: ReturnType<typeof spawn> | undefined;
  let childReady: Promise<void> | undefined;
  let stopping: Promise<void> | undefined;
  const stopChild = (): Promise<void> => {
    stopping ??= (async () => {
      if (!child) return;
      if (!child.pid && childReady) {
        const ready = await Promise.race([
          childReady.then(() => true).catch(() => true),
          new Promise<false>((resolve) =>
            setTimeout(() => resolve(false), 5_000),
          ),
        ]);
        if (!ready) {
          void childReady
            .then(() =>
              child?.pid ? terminateProcessTree(child.pid) : undefined,
            )
            .catch(() => undefined);
          throw new RunnerError(
            "E_EXECUTION",
            "Timed out waiting for the background worker to spawn before cleanup.",
          );
        }
      }
      if (child.pid) await terminateProcessTree(child.pid);
    })();
    return stopping;
  };
  try {
    await ensureCodexClaudeExcluded(root, signal);
    await createJob(root, request, jobId);
    created = true;
    const paths = resolveJobPaths(root, jobId);
    await writeJobRequest(root, jobId, { ...request, background: false });
    const sourceCli = fileURLToPath(new URL("./cli.js", import.meta.url));
    const runningFromTypeScript = fileURLToPath(import.meta.url).endsWith(
      ".ts",
    );
    const cliPath = runningFromTypeScript
      ? sourceCli.replace(/\.js$/, ".ts")
      : sourceCli;
    const traceCarrier: Record<string, string> = {};
    propagation.inject(context.active(), traceCarrier);
    child = spawn(
      process.execPath,
      [
        ...(runningFromTypeScript ? process.execArgv : []),
        cliPath,
        "run",
        "--request-file",
        paths.requestPath,
        "--foreground",
        "--job-id",
        jobId,
        "--format",
        "markdown",
      ],
      {
        cwd: root,
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          CODEX_CLAUDE_AGENT_BACKGROUND_WORKER: "1",
          CODEX_CLAUDE_AGENT_JOB_ID: jobId,
          CODEX_CLAUDE_AGENT_ROOT: root,
          ...(traceCarrier.traceparent
            ? { TRACEPARENT: traceCarrier.traceparent }
            : {}),
          ...(traceCarrier.tracestate
            ? { TRACESTATE: traceCarrier.tracestate }
            : {}),
        },
      },
    );
    childReady = new Promise<void>((resolve, reject) => {
      child?.once("spawn", resolve);
      child?.once("error", reject);
    });
    await raceWithSignal(childReady, signal);
    if (signal.aborted) throw signal.reason;
    if (!child.pid) {
      throw new RunnerError(
        "E_EXECUTION",
        "Unable to start background worker.",
      );
    }
    child.unref();
    const processIdentity = await getProcessIdentity(child.pid, signal);
    if (!processIdentity) {
      throw new RunnerError(
        "E_EXECUTION",
        "Unable to verify the background worker process identity.",
      );
    }
    const launchTransition = await transitionJob(
      root,
      jobId,
      {
        pid: child.pid,
        processIdentity,
        detachedProcessGroup: true,
        dedicatedProcess: true,
      },
      ["queued", "running"],
    );
    if (
      !launchTransition.applied &&
      launchTransition.job.state === "cancelled"
    ) {
      throw new RunnerError(
        "E_CANCELLED",
        "Background job was cancelled during launch.",
      );
    }
    const result: RunResult = {
      ok: true,
      jobId,
      cwd: root,
      usage: { turns: 0, durationMs: 0 },
      warnings: [],
      artifacts: { resultPath: paths.resultPath, logPath: paths.logPath },
    };
    return RunResultSchema.parse(result);
  } catch (error) {
    let cleanupError: unknown;
    try {
      await stopChild();
    } catch (candidate) {
      cleanupError = candidate;
    }
    if (created && !cleanupError) {
      await failJob(
        root,
        jobId,
        "Claude background worker failed during launch.",
        error,
      ).catch(() => undefined);
    }
    if (cleanupError) throw cleanupError;
    throw error;
  }
}

async function runClaudeInternal(
  input: RunRequestInput,
  options: RunClaudeOptions,
  controller: AbortController,
): Promise<RunResult> {
  const request = RunRequestSchema.parse(input);
  const jobId = options.jobId ?? generateJobId();
  const initialCwd = path.resolve(request.cwd ?? process.cwd());
  let root = initialCwd;
  try {
    root = await storeRoot(request, controller.signal);
  } catch (error) {
    const runnerError = errorForSignal(error, controller.signal);
    return RunResultSchema.parse({
      ok: false,
      jobId,
      cwd: initialCwd,
      usage: { turns: 0, durationMs: 0 },
      warnings: [],
      error: {
        code: runnerError.code,
        message: runnerError.message,
        hint: runnerError.hint,
        retryable: runnerError.retryable,
        attempts: 1,
        cause: runnerError.causeText,
      },
    });
  }

  if (request.background && !options.backgroundWorker) {
    try {
      const diagnostics = await runDiagnostics(root, {
        noCache: options.noDiagnosticsCache,
        needsWorktree: ["create", "ephemeral"].includes(request.worktree.mode),
        signal: controller.signal,
      });
      assertDiagnostics(diagnostics);
      return await launchBackground(request, root, jobId, controller.signal);
    } catch (error) {
      const runnerError = errorForSignal(error, controller.signal);
      return RunResultSchema.parse({
        ok: false,
        jobId,
        cwd: root,
        usage: { turns: 0, durationMs: 0 },
        warnings: [],
        error: {
          code: runnerError.code,
          message: runnerError.message,
          hint: runnerError.hint,
          retryable: runnerError.retryable,
          attempts: 1,
          cause: runnerError.causeText,
        },
      });
    }
  }

  const paths = resolveJobPaths(root, jobId);
  const startedAt = Date.now();
  let workspace: ResolvedWorkspace | undefined;
  let warnings: Warning[] = [];
  let turns = 0;
  let costUsd: number | undefined;
  let model: string | undefined;
  let sessionId: string | undefined;
  let attempts: number;
  let seq = 0;
  let eventQueue = Promise.resolve();
  let eventWriter: JobEventWriter | undefined;
  let jobExists = false;
  const emit = (
    type: StreamEvent["type"],
    data?: Record<string, unknown>,
  ): void => {
    const event = {
      type,
      ts: new Date().toISOString(),
      jobId,
      seq: (seq += 1),
      data,
    } as StreamEvent;
    if (type !== "text_delta") {
      eventQueue = eventQueue.then(async () => {
        eventWriter ??= await createJobEventWriter(root, jobId);
        await eventWriter.append(event);
      });
    }
    options.stream?.(event);
  };
  const onSdkEvent = (event: SdkEvent): void => emit(event.type, event.data);

  try {
    if (options.backgroundWorker) {
      await readJob(root, jobId);
      jobExists = true;
    } else {
      await ensureCodexClaudeExcluded(root, controller.signal);
      await createJob(root, request, jobId);
      jobExists = true;
    }
    const worker = await probeProcessIdentity(process.pid, controller.signal);
    if (!worker.identity) {
      // Carry the probe's reason. Without it this is a dead end: the run stops
      // before Claude starts and the log says only that identity failed.
      throw new RunnerError(
        "E_EXECUTION",
        `Unable to verify the Claude worker process identity: ${worker.reason ?? "no reason reported"}`,
        {
          hint: "The job's ownership guard needs the process start time; see the reason above.",
        },
      );
    }
    const workerIdentity = worker.identity;
    const claimed = await updateJob(
      root,
      jobId,
      {
        state: "running",
        startedAt: new Date().toISOString(),
        pid: process.pid,
        processIdentity: workerIdentity,
        dedicatedProcess:
          options.backgroundWorker === true ||
          options.dedicatedProcess === true,
        detachedProcessGroup: options.backgroundWorker ? true : undefined,
      },
      ["queued"],
    );
    if (claimed.state !== "running") {
      throw new RunnerError(
        "E_CANCELLED",
        `Claude job ${jobId} was cancelled before its worker claimed it.`,
      );
    }

    const diagnostics = await runDiagnostics(root, {
      noCache: options.noDiagnosticsCache,
      needsWorktree: ["create", "ephemeral"].includes(request.worktree.mode),
      signal: controller.signal,
    });
    assertDiagnostics(diagnostics);
    workspace = await resolveWorkspace(request, jobId, controller.signal, root);
    if (workspace.worktree) {
      await updateJob(root, jobId, { worktree: workspace.worktree }, [
        "running",
      ]);
    }
    const prepared = await preambleWarnings(
      workspace,
      request,
      controller.signal,
    );
    warnings = prepared.warnings;
    const validator = compileOutputSchema(request);
    const agents = await raceWithSignal(loadAgents(request), controller.signal);
    let retryError: RunnerError | undefined;
    let structuredRetryError: RunnerError | undefined;
    const execute = options.execute ?? executeQuery;
    const retried = await withRetry(
      async (attempt) => {
        const nextRequest: ExecuteQueryRequest = {
          ...request,
          prompt: structuredRetryError
            ? repairPrompt(structuredRetryError)
            : prepared.prompt,
          cwd: workspace?.cwd ?? request.cwd,
          additionalDirectories: workspace?.sdkAdditionalDirectories,
          agents,
          resume: retryError?.sessionId ?? request.resume,
          fork: retryError?.sessionId ? false : request.fork,
          onEvent: onSdkEvent,
          projectInstructions: prepared.projectInstructions,
          attempt,
        };
        const outcome = await execute(nextRequest, controller.signal);
        sessionId = outcome.sessionId;
        return validateStructured(outcome, validator);
      },
      {
        ...request.retry,
        ...options.retryOptions,
        signal: controller.signal,
      },
      (notice) => {
        retryError = notice.error;
        if (notice.error.code === "E_STRUCTURED_OUTPUT") {
          structuredRetryError = notice.error;
        }
        if (notice.error.sessionId) sessionId = notice.error.sessionId;
        const warning: Warning = {
          code: "W_RETRY",
          message: `Retrying after ${notice.reason}; attempt ${notice.nextAttempt}.`,
          hint: `Backoff ${notice.delayMs}ms.`,
        };
        warnings.push(warning);
        emit("retry", {
          attempt: notice.nextAttempt,
          delayMs: notice.delayMs,
          reason: notice.reason,
        });
        emit("warning", warning);
      },
    );
    attempts = retried.attempts;
    const outcome = retried.value;
    sessionId = outcome.sessionId;
    turns = outcome.turns;
    costUsd = outcome.costUsd;
    model = outcome.model;
    warnings.push(...outcome.warnings);
    if (costUsd !== undefined && costUsd >= request.maxBudgetUsd * 0.8) {
      warnings.push({
        code: "W_BUDGET_80PCT",
        message: `Run used at least 80% of its $${request.maxBudgetUsd.toFixed(2)} budget.`,
        hint: "Narrow future tasks or increase the budget intentionally.",
      });
    }
    warnings.push(...(await workspace.finish(true)));
    const result = RunResultSchema.parse({
      ok: true,
      jobId,
      sessionId,
      cwd: workspace.cwd,
      worktree: workspace.worktree,
      result: outcome.result,
      structured: outcome.structured,
      usage: { turns, costUsd, durationMs: Date.now() - startedAt, model },
      warnings,
      artifacts: { resultPath: paths.resultPath, logPath: paths.logPath },
    });
    const transition = await transitionJob(
      root,
      jobId,
      {
        state: "completed",
        unread: options.backgroundWorker ?? false,
        completedAt: new Date().toISOString(),
        pid: undefined,
        processIdentity: undefined,
        detachedProcessGroup: undefined,
        worktree: workspace.worktree,
      },
      ["running"],
      async () => writeJobResult(root, result),
    );
    if (transition.applied) {
      try {
        emit("result", { ok: true, sessionId, turns, costUsd });
      } catch {
        // The result and terminal record are already durable; subscribers are best effort.
      }
    }
    await eventQueue.catch(() => undefined);
    return result;
  } catch (error) {
    const runnerError = errorForSignal(error, controller.signal);
    attempts = attemptsFrom(runnerError);
    if (runnerError.sessionId) sessionId = runnerError.sessionId;
    if (workspace) warnings.push(...(await workspace.finish(false)));
    const result = RunResultSchema.parse({
      ok: false,
      jobId,
      sessionId,
      cwd: workspace?.cwd ?? initialCwd,
      worktree: workspace?.worktree,
      usage: { turns, costUsd, durationMs: Date.now() - startedAt, model },
      warnings,
      error: {
        code: runnerError.code,
        message: runnerError.message,
        hint: runnerError.hint,
        retryable: runnerError.retryable,
        attempts,
        cause: runnerError.causeText,
      },
      artifacts: jobExists
        ? { resultPath: paths.resultPath, logPath: paths.logPath }
        : undefined,
    });
    if (jobExists) {
      const state: "cancelled" | "failed" =
        runnerError.code === "E_CANCELLED" ? "cancelled" : "failed";
      const patch = {
        state,
        unread: options.backgroundWorker ?? false,
        completedAt: new Date().toISOString(),
        pid: undefined,
        processIdentity: undefined,
        detachedProcessGroup: undefined,
        worktree: workspace?.worktree,
      };
      let transition;
      try {
        transition = await transitionJob(
          root,
          jobId,
          patch,
          ["queued", "running"],
          async () => {
            emit("result", { ok: false, code: runnerError.code });
            await eventQueue;
            await writeJobResult(root, result);
          },
        );
      } catch {
        transition = await transitionJob(root, jobId, { ...patch, result }, [
          "queued",
          "running",
        ]);
      }
      if (!transition.applied) await eventQueue.catch(() => undefined);
    }
    return result;
  } finally {
    await eventWriter?.close().catch(() => undefined);
  }
}

export async function runClaude(
  input: RunRequestInput,
  options: RunClaudeOptions = {},
): Promise<RunResult> {
  const request = RunRequestSchema.parse(input);
  const controller = new AbortController();
  const timeout = setTimeout(
    () =>
      controller.abort(
        new RunnerError(
          "E_TIMEOUT",
          `Claude run exceeded ${request.timeoutMs}ms.`,
        ),
      ),
    request.timeoutMs,
  );
  const cancel = () =>
    controller.abort(
      new RunnerError("E_CANCELLED", "Claude run was cancelled by a signal."),
    );
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    const active = context.active();
    const parent = trace.getSpan(active)
      ? active
      : propagation.extract(active, {
          traceparent: process.env.TRACEPARENT ?? "",
          tracestate: process.env.TRACESTATE ?? "",
        });
    return await context.with(parent, () =>
      tracer.startActiveSpan(
        "claude.run",
        {
          attributes: {
            "claude.mode": request.mode,
            "claude.background": request.background,
            "claude.background_worker": options.backgroundWorker ?? false,
            "claude.worktree_mode": request.worktree.mode,
          },
        },
        async (span) => {
          try {
            const result = await runClaudeInternal(
              request,
              options,
              controller,
            );
            if (result.ok) {
              span.setStatus({ code: SpanStatusCode.OK });
            } else {
              const errorCode = result.error?.code ?? "E_UNKNOWN";
              span.setAttribute("error.type", errorCode);
              span.recordException({
                name: errorCode,
                message: errorCode,
              });
              span.setStatus({ code: SpanStatusCode.ERROR });
            }
            return result;
          } catch (error) {
            const errorType =
              error instanceof Error ? error.name : "UnknownError";
            span.setAttribute("error.type", errorType);
            span.recordException({ name: errorType, message: errorType });
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw error;
          } finally {
            span.end();
          }
        },
      ),
    );
  } finally {
    clearTimeout(timeout);
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}
