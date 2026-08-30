import {
  query,
  type AgentDefinition as SdkAgentDefinition,
  type CanUseTool,
  type Options,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import {
  context,
  propagation,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import { readFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { RunnerError } from "./errors.js";
import type { RunRequest, Warning } from "./schema.js";
import { stateRoot } from "./state.js";
import { VERSION } from "./version.js";

const require = createRequire(import.meta.url);
const tracer = trace.getTracer("@saasontools/codex-claude-agent");

function incomingOrActiveContext() {
  const active = context.active();
  if (trace.getSpan(active)) return active;
  return propagation.extract(active, {
    traceparent: process.env.TRACEPARENT ?? "",
    tracestate: process.env.TRACESTATE ?? "",
  });
}

export const SDK_VERSION = (() => {
  try {
    const entry = require.resolve("@anthropic-ai/claude-agent-sdk");
    const manifest = JSON.parse(
      readFileSync(path.join(path.dirname(entry), "package.json"), "utf8"),
    ) as {
      version?: unknown;
    };
    return typeof manifest.version === "string" ? manifest.version : "unknown";
  } catch {
    return "unknown";
  }
})();

export async function probeClaudeAuth(
  timeoutMs = 10_000,
  signal?: AbortSignal,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const parent = incomingOrActiveContext();
  return context.with(parent, () =>
    tracer.startActiveSpan("claude.auth.probe", async (span) => {
      let session: ReturnType<typeof query> | undefined;
      try {
        session = query({
          prompt: "",
          options: {
            abortController: controller,
            maxTurns: 0,
            tools: [],
            settingSources: [],
            env: cleanEnvironment(),
          },
        });
        const account = await session.accountInfo();
        const authenticated = Boolean(
          account.email ||
          account.organization ||
          account.tokenSource ||
          account.apiKeySource,
        );
        span.setStatus({ code: SpanStatusCode.OK });
        return authenticated;
      } catch (error) {
        const errorType = error instanceof Error ? error.name : "UnknownError";
        span.setAttribute("error.type", errorType);
        span.recordException({ name: errorType, message: errorType });
        span.setStatus({ code: SpanStatusCode.ERROR });
        return false;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        session?.close();
        span.end();
      }
    }),
  );
}

export type SdkEvent = {
  type: "init" | "tool_use" | "tool_result" | "text_delta";
  data?: Record<string, unknown>;
};

export interface ExecuteQueryRequest extends RunRequest {
  onEvent?: (event: SdkEvent) => void;
  projectInstructions?: string;
  attempt?: number;
}

export interface RawOutcome {
  sessionId?: string;
  result: string;
  structured?: unknown;
  turns: number;
  costUsd?: number;
  durationMs: number;
  model?: string;
  warnings: Warning[];
}

const KNOWN_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "Bash",
  "Agent",
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
]);

const READ_ONLY_TOOLS = [
  "Read",
  "Glob",
  "Grep",
  "Bash(git diff:*)",
  "Bash(git log:*)",
  "Bash(git status:*)",
  "Bash(git show:*)",
  "Agent",
];
const EDIT_TOOLS = [...READ_ONLY_TOOLS, "Edit", "Write", "MultiEdit"];
const SAFE_ENV_KEYS = new Set([
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "PWD",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "TERM",
  "NO_COLOR",
  "FORCE_COLOR",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NODE_EXTRA_CA_CERTS",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CONFIG_DIR",
  "ENABLE_PROMPT_CACHING_1H",
  "FORCE_PROMPT_CACHING_5M",
  "TRACEPARENT",
  "TRACESTATE",
]);
const SHELL_CONTROL_PATTERN = /[\r\n;&|`$<>\\()]/;
const UNSAFE_GIT_OPTION_PATTERN =
  /(?:^|\s)(?:-c|--config-env|--exec-path|--ext-diff|--textconv|--output|--paginate|-P)(?=\s|=|$)/;

export function validateAllowedTools(tools: string[]): string[] {
  for (const tool of tools) {
    const bashPattern = /^Bash\(([^\r\n()]+)\)$/.exec(tool);
    if (!KNOWN_TOOLS.has(tool) && !bashPattern) {
      throw new RunnerError(
        "E_INVALID_REQUEST",
        `Unknown or unsafe tool rule: ${tool}`,
        {
          hint: "Use a known Claude Code tool name or Bash(command-prefix:*).",
        },
      );
    }
  }
  return [...new Set(tools)];
}

export function defaultAllowedTools(mode: RunRequest["mode"]): string[] {
  return [...(mode === "edit" ? EDIT_TOOLS : READ_ONLY_TOOLS)];
}

export function cleanEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (SAFE_ENV_KEYS.has(key) || key.startsWith("LC_")) env[key] = value;
  }
  env.CODEX_CLAUDE_AGENT_NESTED = "1";
  env.CLAUDE_AGENT_SDK_CLIENT_APP = `@saasontools/codex-claude-agent/${VERSION}`;
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_PAGER = "cat";
  env.GIT_OPTIONAL_LOCKS = "0";
  env.GIT_CONFIG_COUNT = "1";
  env.GIT_CONFIG_KEY_0 = "core.fsmonitor";
  env.GIT_CONFIG_VALUE_0 = "false";
  return env;
}

export function commandAllowed(command: string, tools: string[]): boolean {
  if (tools.includes("Bash")) return true;
  if (
    SHELL_CONTROL_PATTERN.test(command) ||
    UNSAFE_GIT_OPTION_PATTERN.test(command)
  )
    return false;
  return tools.some((rule) => {
    const match = /^Bash\((.*)\)$/.exec(rule);
    if (!match) return false;
    const pattern = match[1]!;
    const prefix = pattern.endsWith(":*") ? pattern.slice(0, -2) : pattern;
    return command === prefix || command.startsWith(`${prefix} `);
  });
}

function pathWithin(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

async function canonicalCandidate(candidate: string): Promise<string> {
  let existing = candidate;
  while (true) {
    try {
      const canonical = await realpath(existing);
      return path.resolve(canonical, path.relative(existing, candidate));
    } catch {
      const parent = path.dirname(existing);
      if (parent === existing) return candidate;
      existing = parent;
    }
  }
}

async function inputPathsAllowed(
  toolName: string,
  input: Record<string, unknown>,
  cwd: string,
  allowedRoots: string[],
  protectedRoots: string[],
): Promise<boolean> {
  const pathKeys =
    toolName === "NotebookEdit"
      ? ["notebook_path"]
      : ["Read", "Edit", "Write", "MultiEdit"].includes(toolName)
        ? ["file_path"]
        : ["Glob", "Grep"].includes(toolName)
          ? ["path"]
          : [];
  for (const key of pathKeys) {
    const raw = input[key];
    if (raw === undefined && ["Glob", "Grep"].includes(toolName)) continue;
    if (typeof raw !== "string") return false;
    const candidate = await canonicalCandidate(path.resolve(cwd, raw));
    if (!allowedRoots.some((root) => pathWithin(candidate, root))) return false;
    if (protectedRoots.some((root) => pathWithin(candidate, root)))
      return false;
  }
  return true;
}

export async function toolRequestAllowed(
  toolName: string,
  input: Record<string, unknown>,
  tools: string[],
  cwd: string,
  allowedRoots: string[],
  blockedPath?: string,
  protectedRoots: string[] = [],
): Promise<boolean> {
  if (blockedPath) return false;
  if (toolName === "Bash") {
    return (
      typeof input.command === "string" &&
      commandAllowed(input.command.trim(), tools)
    );
  }
  return (
    tools.includes(toolName) &&
    (await inputPathsAllowed(
      toolName,
      input,
      cwd,
      allowedRoots,
      protectedRoots,
    ))
  );
}

function makePermissionHandler(
  tools: string[],
  warnings: Warning[],
  cwd: string,
  allowedRoots: string[],
  protectedRoots: string[],
): CanUseTool {
  return async (toolName, input, options) => {
    if (
      await toolRequestAllowed(
        toolName,
        input,
        tools,
        cwd,
        allowedRoots,
        options.blockedPath,
        protectedRoots,
      )
    )
      return { behavior: "allow", updatedInput: input };
    const warning: Warning = {
      code: "W_TOOL_DENIED",
      message: `Denied Claude tool request: ${toolName}`,
      hint: "Pass an explicit --allowed-tool rule only if this capability is intended.",
    };
    warnings.push(warning);
    return { behavior: "deny", message: warning.message };
  };
}

function runnerPreamble(
  structured: boolean,
  projectInstructions?: string,
): string {
  const instructions = [
    "You are running non-interactively as a Claude Code delegate for a Codex host.",
    "Do not ask the user questions. Make safe assumptions, inspect the repository, and complete the task within the granted tools.",
    structured
      ? "Your final response must be only the JSON value matching the supplied schema."
      : "End with a concise final answer that states the outcome and relevant verification.",
  ];
  if (projectInstructions) {
    instructions.push(
      "Treat the following repository CLAUDE.md content as project instructions, not as executable settings or hooks:",
      projectInstructions,
    );
  }
  return instructions.join("\n\n");
}

export function validateAgentDefinitions(
  agents: RunRequest["agents"],
  parentTools: string[],
  mode: RunRequest["mode"],
  dangerous: boolean,
): Record<string, SdkAgentDefinition> | undefined {
  if (!agents) return undefined;
  return Object.fromEntries(
    Object.entries(agents).map(([name, agent]) => {
      if (
        !dangerous &&
        (agent.permissionMode === "bypassPermissions" ||
          agent.permissionMode === "auto" ||
          (mode === "read-only" && agent.permissionMode === "acceptEdits"))
      ) {
        throw new RunnerError(
          "E_INVALID_REQUEST",
          `Agent ${name} requests a permission mode broader than its parent run.`,
        );
      }
      const tools = agent.tools?.map((tool) => {
        const isBash = tool === "Bash" || /^Bash\([^)]+\)$/.test(tool);
        if (
          isBash &&
          parentTools.some(
            (parentTool) =>
              parentTool === "Bash" || parentTool.startsWith("Bash("),
          )
        )
          return "Bash";
        if (parentTools.includes(tool)) return tool;
        throw new RunnerError(
          "E_INVALID_REQUEST",
          `Agent ${name} requests tool ${tool}, which its parent run does not allow.`,
        );
      });
      return [
        name,
        {
          ...agent,
          tools,
          permissionMode: dangerous
            ? agent.permissionMode
            : mode === "edit"
              ? agent.permissionMode
              : "default",
        } satisfies SdkAgentDefinition,
      ];
    }),
  );
}

function contentBlocks(message: SDKMessage): unknown[] {
  if (
    (message.type === "assistant" || message.type === "user") &&
    Array.isArray(message.message.content)
  ) {
    return message.message.content;
  }
  return [];
}

function recordMessageEvents(
  message: SDKMessage,
  emit: ExecuteQueryRequest["onEvent"],
): void {
  if (!emit) return;
  if (message.type === "stream_event") {
    const event = message.event as unknown;
    if (
      isRecord(event) &&
      event.type === "content_block_delta" &&
      isRecord(event.delta)
    ) {
      if (
        event.delta.type === "text_delta" &&
        typeof event.delta.text === "string"
      ) {
        emit({ type: "text_delta", data: { text: event.delta.text } });
      }
    }
    return;
  }
  for (const block of contentBlocks(message)) {
    if (!isRecord(block) || typeof block.type !== "string") continue;
    if (block.type === "tool_use") {
      emit({
        type: "tool_use",
        data: {
          id: typeof block.id === "string" ? block.id : undefined,
          name: typeof block.name === "string" ? block.name : undefined,
        },
      });
    } else if (block.type === "tool_result") {
      emit({
        type: "tool_result",
        data: {
          toolUseId:
            typeof block.tool_use_id === "string"
              ? block.tool_use_id
              : undefined,
          isError: block.is_error === true,
        },
      });
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function classifySdkResultError(
  message: Extract<SDKMessage, { type: "result" }>,
): RunnerError {
  if (message.subtype === "success") {
    throw new RunnerError("E_UNKNOWN", "Expected an SDK error result.");
  }
  const cause = message.errors.join("; ") || message.subtype;
  if (message.subtype === "error_max_turns") {
    return new RunnerError(
      "E_MAX_TURNS",
      "Claude exhausted the maximum turn limit.",
      {
        cause,
        sessionId: message.session_id,
      },
    );
  }
  if (message.subtype === "error_max_budget_usd") {
    return new RunnerError(
      "E_MAX_BUDGET",
      "Claude exhausted the maximum USD budget.",
      {
        cause,
        sessionId: message.session_id,
      },
    );
  }
  if (message.subtype === "error_max_structured_output_retries") {
    return new RunnerError(
      "E_STRUCTURED_OUTPUT",
      "Claude could not produce output matching the JSON schema.",
      {
        cause,
        sessionId: message.session_id,
        retryable: true,
      },
    );
  }
  const transient = /429|5\d\d|overload|connection|stream|timeout/i.test(cause);
  return new RunnerError(
    transient ? "E_TRANSIENT_API" : "E_EXECUTION",
    "Claude failed during execution.",
    {
      cause,
      retryable: transient,
      sessionId: message.session_id,
    },
  );
}

async function executeQueryInternal(
  req: ExecuteQueryRequest,
  signal: AbortSignal,
): Promise<RawOutcome> {
  const warnings: Warning[] = [];
  const allowedTools = validateAllowedTools(
    req.allowedTools ?? defaultAllowedTools(req.mode),
  );
  const dangerous = req.dangerouslyAllowAll;
  if (dangerous && (process.stdin.isTTY || process.stdout.isTTY)) {
    throw new RunnerError(
      "E_INVALID_REQUEST",
      "--dangerously-allow-all is refused when the process is interactive.",
      { hint: "Use explicit --allowed-tool rules instead." },
    );
  }
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });

  const cwd = path.resolve(req.cwd ?? process.cwd());
  const allowedRoots = await Promise.all(
    [cwd, ...(req.additionalDirectories ?? [])].map((entry) =>
      canonicalCandidate(path.resolve(entry)),
    ),
  );
  const protectedRoots = await Promise.all(
    [
      stateRoot(),
      ...allowedRoots.map((root) => path.join(root, ".codex-claude", "jobs")),
    ].map(canonicalCandidate),
  );
  const options: Options = {
    abortController: controller,
    cwd,
    additionalDirectories: req.additionalDirectories,
    agents: validateAgentDefinitions(
      req.agents,
      allowedTools,
      req.mode,
      dangerous,
    ),
    settingSources: req.settingSources,
    permissionMode: dangerous
      ? "bypassPermissions"
      : req.mode === "edit"
        ? "acceptEdits"
        : "default",
    allowDangerouslySkipPermissions: dangerous || undefined,
    tools: [...new Set(allowedTools.map((tool) => tool.split("(")[0]!))],
    canUseTool: dangerous
      ? undefined
      : makePermissionHandler(
          allowedTools,
          warnings,
          cwd,
          allowedRoots,
          protectedRoots,
        ),
    model: req.model,
    effort: req.effort,
    maxTurns: req.maxTurns,
    maxBudgetUsd: req.maxBudgetUsd,
    resume: req.resume,
    forkSession: req.fork || undefined,
    env: cleanEnvironment(),
    systemPrompt: req.loadClaudeMd
      ? {
          type: "preset",
          preset: "claude_code",
          append: runnerPreamble(
            req.outputSchema !== undefined,
            req.projectInstructions,
          ),
        }
      : runnerPreamble(req.outputSchema !== undefined),
    outputFormat: req.outputSchema
      ? { type: "json_schema", schema: req.outputSchema }
      : undefined,
    includePartialMessages: true,
    sandbox: dangerous
      ? undefined
      : {
          enabled: true,
          failIfUnavailable: true,
          autoAllowBashIfSandboxed: false,
          allowUnsandboxedCommands: false,
          filesystem: {
            allowWrite: req.mode === "edit" ? allowedRoots : [],
            denyRead: protectedRoots,
            denyWrite: protectedRoots,
          },
        },
  };

  let sessionId: string | undefined;
  let model: string | undefined;
  let sawToolUse = false;
  try {
    for await (const message of query({ prompt: req.prompt, options })) {
      if (message.type === "system" && message.subtype === "init") {
        sessionId = message.session_id;
        model = message.model;
        req.onEvent?.({
          type: "init",
          data: {
            sessionId,
            model,
            cwd: message.cwd,
            agents: message.agents ?? [],
          },
        });
      }
      if (
        contentBlocks(message).some(
          (block) => isRecord(block) && block.type === "tool_use",
        )
      )
        sawToolUse = true;
      recordMessageEvents(message, req.onEvent);
      if (message.type !== "result") continue;
      sessionId = message.session_id;
      if (message.subtype !== "success") {
        const classified = classifySdkResultError(message);
        throw new RunnerError(classified.code, classified.message, {
          cause: classified.causeText,
          hint: classified.hint,
          retryable: classified.retryable && !sawToolUse,
          sessionId: classified.sessionId,
          hasPartialResult: sawToolUse,
        });
      }
      return {
        sessionId,
        result: message.result,
        structured: message.structured_output,
        turns: message.num_turns,
        costUsd: message.total_cost_usd,
        durationMs: message.duration_ms,
        model: model ?? Object.keys(message.modelUsage)[0],
        warnings,
      };
    }
    throw new RunnerError(
      "E_EXECUTION",
      "Claude SDK stream ended without a result message.",
      {
        retryable: !sawToolUse,
        sessionId,
        hasPartialResult: sawToolUse,
      },
    );
  } catch (error) {
    if (error instanceof RunnerError) throw error;
    if (signal.aborted || controller.signal.aborted) {
      const reason = signal.reason;
      if (reason instanceof RunnerError) throw reason;
      throw new RunnerError("E_CANCELLED", "Claude run was cancelled.", {
        cause: error,
        sessionId,
        hasPartialResult: sawToolUse,
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/authentication|unauthorized|api key|oauth/i.test(message)) {
      throw new RunnerError("E_AUTH", "Claude authentication failed.", {
        cause: error,
        sessionId,
      });
    }
    if (
      /429|5\d\d|overload|ECONNRESET|ETIMEDOUT|fetch failed|stream/i.test(
        message,
      )
    ) {
      throw new RunnerError(
        "E_TRANSIENT_API",
        "Transient Claude API failure.",
        {
          cause: error,
          retryable: true,
          sessionId,
          hasPartialResult: sawToolUse,
        },
      );
    }
    throw new RunnerError("E_EXECUTION", "Claude SDK execution failed.", {
      cause: error,
      sessionId,
      retryable: false,
      hasPartialResult: sawToolUse,
    });
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

export async function executeQuery(
  req: ExecuteQueryRequest,
  signal: AbortSignal,
): Promise<RawOutcome> {
  const parent = incomingOrActiveContext();
  return context.with(parent, () =>
    tracer.startActiveSpan(
      "claude.agent_sdk.query",
      {
        attributes: {
          "gen_ai.provider.name": "anthropic",
          "gen_ai.operation.name": "invoke_agent",
          "claude.mode": req.mode,
          "claude.structured_output": req.outputSchema !== undefined,
          "claude.retry_attempt": req.attempt ?? 1,
          ...(req.model ? { "gen_ai.request.model": req.model } : {}),
        },
      },
      async (span) => {
        try {
          const outcome = await executeQueryInternal(req, signal);
          span.setAttributes({
            "claude.output_turns": outcome.turns,
            ...(outcome.model
              ? { "gen_ai.response.model": outcome.model }
              : {}),
          });
          span.setStatus({ code: SpanStatusCode.OK });
          return outcome;
        } catch (error) {
          span.recordException(
            error instanceof Error ? error : new Error(String(error)),
          );
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });
          throw error;
        } finally {
          span.end();
        }
      },
    ),
  );
}
