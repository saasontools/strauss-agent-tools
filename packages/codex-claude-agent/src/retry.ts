import { RunnerError, toRunnerError } from "./errors.js";

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  random?: () => number;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
}

export interface RetryNotice {
  attempt: number;
  nextAttempt: number;
  delayMs: number;
  reason: string;
  error: RunnerError;
}

const TRANSIENT_PATTERN =
  /(?:\b429\b|\b5\d\d\b|overloaded|connection (?:reset|closed)|ECONNRESET|ETIMEDOUT|fetch failed|stream (?:stall|stalled|timeout))/i;

export function classifyRetry(error: unknown): {
  retry: boolean;
  reason: string;
} {
  const runnerError = toRunnerError(error);
  if (runnerError.code === "E_STRUCTURED_OUTPUT") {
    return { retry: true, reason: "structured-output validation failed" };
  }
  if (runnerError.code === "E_TRANSIENT_API" && !runnerError.hasPartialResult) {
    return { retry: true, reason: runnerError.message };
  }
  if (
    runnerError.code === "E_EXECUTION" &&
    runnerError.retryable &&
    !runnerError.hasPartialResult
  ) {
    return {
      retry: true,
      reason: "execution failed before producing a partial result",
    };
  }
  if (
    runnerError.code === "E_UNKNOWN" &&
    TRANSIENT_PATTERN.test(
      `${runnerError.message} ${runnerError.causeText ?? ""}`,
    )
  ) {
    return { retry: true, reason: "transient API or connection failure" };
  }
  return { retry: false, reason: "non-retryable error" };
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
  onRetry?: (notice: RetryNotice) => void | Promise<void>,
): Promise<{ value: T; attempts: number }> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 2_000;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? sleepWithSignal;
  let structuredRetries = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return { value: await operation(attempt), attempts: attempt };
    } catch (error) {
      const runnerError = toRunnerError(error);
      const classification = classifyRetry(runnerError);
      const structuredLimitReached =
        runnerError.code === "E_STRUCTURED_OUTPUT" && structuredRetries >= 1;
      if (
        !classification.retry ||
        structuredLimitReached ||
        attempt >= maxAttempts
      ) {
        Object.defineProperty(runnerError, "attempts", {
          value: attempt,
          enumerable: false,
        });
        throw runnerError;
      }
      if (runnerError.code === "E_STRUCTURED_OUTPUT") structuredRetries += 1;
      const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delayMs = Math.floor(random() * cap);
      await onRetry?.({
        attempt,
        nextAttempt: attempt + 1,
        delayMs,
        reason: classification.reason,
        error: runnerError,
      });
      await sleep(delayMs, options.signal);
    }
  }
  throw new RunnerError("E_UNKNOWN", "Retry loop exited unexpectedly.");
}

export async function sleepWithSignal(
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (delayMs <= 0) return;
  if (signal?.aborted) {
    throw (
      signal.reason ??
      new RunnerError("E_CANCELLED", "Run cancelled during retry backoff.")
    );
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(
          signal.reason ??
            new RunnerError(
              "E_CANCELLED",
              "Run cancelled during retry backoff.",
            ),
        );
      },
      { once: true },
    );
  });
}
