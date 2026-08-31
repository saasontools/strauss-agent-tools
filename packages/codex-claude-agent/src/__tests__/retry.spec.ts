import { describe, expect, it, vi } from "vitest";

import { RunnerError } from "../errors.js";
import { classifyRetry, withRetry } from "../retry.js";

describe.each([
  ["transient status", new RunnerError("E_TRANSIENT_API", "HTTP 429"), true],
  [
    "transient status after a tool use",
    new RunnerError("E_TRANSIENT_API", "HTTP 429", {
      retryable: true,
      hasPartialResult: true,
    }),
    false,
  ],
  [
    "execution without partial result",
    new RunnerError("E_EXECUTION", "failed", { retryable: true }),
    true,
  ],
  [
    "execution with partial result",
    new RunnerError("E_EXECUTION", "failed", {
      retryable: true,
      hasPartialResult: true,
    }),
    false,
  ],
  [
    "structured output",
    new RunnerError("E_STRUCTURED_OUTPUT", "bad JSON"),
    true,
  ],
  ["auth", new RunnerError("E_AUTH", "missing"), false],
  ["max turns", new RunnerError("E_MAX_TURNS", "done"), false],
  ["timeout", new RunnerError("E_TIMEOUT", "late"), false],
] as const)("retry classification: %s", (_name, error, expected) => {
  it(`returns retry=${expected}`, () => {
    expect(classifyRetry(error).retry).toBe(expected);
  });
});

describe("withRetry", () => {
  it("uses exponential full jitter and returns the attempt count", async () => {
    const operation = vi
      .fn<(_: number) => Promise<string>>()
      .mockRejectedValueOnce(new RunnerError("E_TRANSIENT_API", "overloaded"))
      .mockResolvedValue("ok");
    const sleep = vi.fn(async () => undefined);
    const notices: number[] = [];
    const outcome = await withRetry(
      operation,
      { baseDelayMs: 2_000, random: () => 0.5, sleep },
      (notice) => {
        notices.push(notice.delayMs);
      },
    );
    expect(outcome).toEqual({ value: "ok", attempts: 2 });
    expect(notices).toEqual([1_000]);
    expect(sleep).toHaveBeenCalledWith(1_000, undefined);
  });

  it("repairs structured output at most once", async () => {
    const operation = vi.fn(async () => {
      throw new RunnerError("E_STRUCTURED_OUTPUT", "still invalid");
    });
    await expect(
      withRetry(operation, { maxAttempts: 5, sleep: async () => undefined }),
    ).rejects.toMatchObject({
      code: "E_STRUCTURED_OUTPUT",
    });
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
