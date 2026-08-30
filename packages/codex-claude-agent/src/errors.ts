import { z } from "zod";

export const errorCodes = [
  "E_AUTH",
  "E_SDK_MISSING",
  "E_SDK_VERSION",
  "E_CLAUDE_MISSING",
  "E_NOT_GIT_REPO",
  "E_WORKTREE_NOT_FOUND",
  "E_WORKTREE_EXISTS",
  "E_BRANCH_EXISTS",
  "E_DETACHED_HEAD",
  "E_NESTED",
  "E_TIMEOUT",
  "E_CANCELLED",
  "E_MAX_TURNS",
  "E_MAX_BUDGET",
  "E_STRUCTURED_OUTPUT",
  "E_TRANSIENT_API",
  "E_EXECUTION",
  "E_INVALID_REQUEST",
  "E_UNKNOWN",
] as const;

export const ErrorCodeSchema = z.enum(errorCodes);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const warningCodes = [
  "W_DIRTY_TREE",
  "W_WORKTREE_RETAINED",
  "W_TOOL_DENIED",
  "W_RETRY",
  "W_LARGE_DIFF",
  "W_NO_CLAUDE_MD",
  "W_BUDGET_80PCT",
] as const;

export const WarningCodeSchema = z.enum(warningCodes);

export const ERROR_EXIT_CODES: Readonly<Record<ErrorCode, number>> = {
  E_AUTH: 10,
  E_SDK_MISSING: 11,
  E_SDK_VERSION: 12,
  E_CLAUDE_MISSING: 13,
  E_NOT_GIT_REPO: 20,
  E_WORKTREE_NOT_FOUND: 21,
  E_WORKTREE_EXISTS: 22,
  E_BRANCH_EXISTS: 23,
  E_DETACHED_HEAD: 24,
  E_NESTED: 25,
  E_TIMEOUT: 30,
  E_CANCELLED: 31,
  E_MAX_TURNS: 32,
  E_MAX_BUDGET: 33,
  E_STRUCTURED_OUTPUT: 34,
  E_TRANSIENT_API: 40,
  E_EXECUTION: 41,
  E_INVALID_REQUEST: 42,
  E_UNKNOWN: 70,
};

const ERROR_HINTS: Readonly<Record<ErrorCode, string>> = {
  E_AUTH: "Set ANTHROPIC_API_KEY or run `claude auth login`.",
  E_SDK_MISSING: "Install dependencies with `pnpm install`.",
  E_SDK_VERSION:
    "Upgrade @anthropic-ai/claude-agent-sdk to the supported minimum.",
  E_CLAUDE_MISSING:
    "Install Claude Code, or point CODEX_CLAUDE_AGENT_CLAUDE_PATH at its executable.",
  E_NOT_GIT_REPO: "Run inside a Git repository or pass --no-git.",
  E_WORKTREE_NOT_FOUND:
    "Pass a path listed by `git worktree list --porcelain`.",
  E_WORKTREE_EXISTS: "Choose a new worktree path or use --worktree existing.",
  E_BRANCH_EXISTS: "Choose a new branch name or remove the conflicting branch.",
  E_DETACHED_HEAD: "Check out a branch or pass --allow-detached explicitly.",
  E_NESTED:
    "Delegate from the parent Codex session; nested delegation is suppressed.",
  E_TIMEOUT: "Increase --timeout or reduce the requested scope.",
  E_CANCELLED: "Start a new run when you are ready to continue.",
  E_MAX_TURNS: "Increase --max-turns or narrow the task.",
  E_MAX_BUDGET: "Increase --budget or narrow the task.",
  E_STRUCTURED_OUTPUT: "Fix or simplify the JSON schema, then run again.",
  E_TRANSIENT_API:
    "Wait briefly and run again; the retry budget was exhausted.",
  E_EXECUTION: "Inspect log.jsonl and the retained worktree, if any.",
  E_INVALID_REQUEST: "Correct the request flags or input and run again.",
  E_UNKNOWN: "Inspect log.jsonl and rerun with --stream for more detail.",
};

export class RunnerError extends Error {
  readonly code: ErrorCode;
  readonly hint: string;
  readonly retryable: boolean;
  readonly causeText?: string;
  readonly sessionId?: string;
  readonly hasPartialResult: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      hint?: string;
      retryable?: boolean;
      cause?: unknown;
      sessionId?: string;
      hasPartialResult?: boolean;
    } = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "RunnerError";
    this.code = code;
    this.hint = options.hint ?? ERROR_HINTS[code];
    this.retryable = options.retryable ?? false;
    this.causeText = causeToString(options.cause);
    this.sessionId = options.sessionId;
    this.hasPartialResult = options.hasPartialResult ?? false;
  }
}

export function causeToString(cause: unknown): string | undefined {
  if (cause === undefined || cause === null) return undefined;
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

export function toRunnerError(error: unknown): RunnerError {
  if (error instanceof RunnerError) return error;
  const message = causeToString(error) ?? "Unknown failure";
  return new RunnerError("E_UNKNOWN", message, { cause: error });
}

export function exitCodeFor(error: ErrorCode | RunnerError): number {
  return ERROR_EXIT_CODES[typeof error === "string" ? error : error.code];
}
