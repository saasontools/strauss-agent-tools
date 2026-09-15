import { ANSWER_TOOL_NAME, ANSWER_TOOL_SCHEMA, parseAnswer } from "./prompt.js";
import type { CellUsage, ModelAnswer } from "./model.js";

export type BenchRequest = {
  model: string;
  system: string;
  /**
   * The arm's rendered bundle. Sent as its own content block carrying the cache
   * breakpoint: it is identical across every question in that arm.
   */
  bundle: string;
  /** The question and the answer instructions. Varies per call, so it sits
   * after the breakpoint and is never cached. */
  question: string;
  maxTokens: number;
  /**
   * The repeat's seed. Neither the Messages API nor the Claude Code CLI takes
   * one, so the real transports ignore it; it is here so a fake transport can
   * vary its answer per repeat the way a model does.
   */
  seed?: number;
};

export type BenchResponse = {
  answer: ModelAnswer | null;
  /**
   * The output cap this call actually ran under: `null` when the transport has
   * no way to cap output. Absent means the request's own `maxTokens` held.
   */
  maxTokens?: number | null;
  usage: CellUsage;
};

/**
 * Everything the runner needs from a model. A function rather than a client, so
 * the dry-run suite can assert on exactly what would have been sent without a
 * network stub or a recorded cassette.
 */
export type Transport = (request: BenchRequest) => Promise<BenchResponse>;

export const EMPTY_USAGE: CellUsage = {
  inputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  outputTokens: 0,
};

export type MockTransport = Transport & {
  /** Every request the runner made, in order. */
  readonly requests: readonly BenchRequest[];
};

/**
 * A transport that answers from a function instead of a model. The function
 * sees the whole assembled request, so a dry-run case can key its canned answer
 * off the question text, the arm's rendering, or both.
 */
export function mockTransport(
  answers: (request: BenchRequest) => Partial<ModelAnswer> | null,
): MockTransport {
  const requests: BenchRequest[] = [];
  const transport = (async (request: BenchRequest) => {
    requests.push(request);
    const canned = answers(request);
    if (canned === null) {
      return { answer: null, usage: EMPTY_USAGE };
    }
    return {
      answer: {
        answer: canned.answer ?? "",
        value: canned.value ?? "",
        actionable: canned.actionable ?? true,
        conceptIds: canned.conceptIds ?? [],
      },
      usage: {
        inputTokens: request.question.length >> 2,
        cacheWriteTokens: 0,
        cacheReadTokens: request.bundle.length >> 2,
        outputTokens: 64,
      },
    };
  }) as MockTransport;
  Object.defineProperty(transport, "requests", { get: () => requests });
  return transport;
}

/**
 * The real transport.
 *
 * The SDK is imported dynamically because it is a bench-only devDependency and
 * the dry-run suite CI runs must not need it resolvable.
 *
 * Three choices:
 *
 * - **Thinking is off and the answer tool is forced.** The experiment varies
 *   one thing, the fields in the prompt.
 * - **The cache breakpoint sits on the bundle block, not the system prompt.**
 *   The system prompt is under every model's `minCacheableTokens`; the bundle
 *   is large and identical across an arm's questions. See `bench/README.md`.
 * - **Default 5-minute TTL.** An arm's questions are issued back to back; the
 *   1-hour TTL bills a higher write premium than `CACHE_WRITE_MULTIPLIER`.
 */
export function anthropicTransport(options: RetryOptions = {}): Transport {
  let clientPromise: Promise<{
    messages: { create(body: unknown): Promise<unknown> };
  }> | null = null;

  const call = async (request: BenchRequest): Promise<BenchResponse> => {
    clientPromise ??= import("@anthropic-ai/sdk").then(
      ({ default: Anthropic }) => new Anthropic(),
    );
    const client = await clientPromise;

    const response = (await client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens,
      system: request.system,
      tools: [
        {
          name: ANSWER_TOOL_NAME,
          description: "Submit the structured answer to the question.",
          input_schema: ANSWER_TOOL_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: ANSWER_TOOL_NAME },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: request.bundle,
              cache_control: { type: "ephemeral" },
            },
            { type: "text", text: request.question },
          ],
        },
      ],
    })) as {
      content: Array<{ type: string; name?: string; input?: unknown }>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
    };

    const toolUse = response.content.find(
      (block) => block.type === "tool_use" && block.name === ANSWER_TOOL_NAME,
    );

    const usage = response.usage ?? {};
    return {
      answer: toolUse ? parseAnswer(toolUse.input) : null,
      usage: {
        inputTokens: usage.input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
      },
    };
  };

  return withRetry(call, options);
}

export type RetryOptions = {
  /** Total attempts, first included. */
  attempts?: number;
  /** First backoff, in ms. Doubles each attempt, with full jitter. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

/** HTTP statuses worth trying again: throttling, timeouts, and server faults. */
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

/** Node/undici error codes that mean the connection itself failed. */
const RETRYABLE_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
]);

/**
 * Retry only real transport faults: a retryable HTTP status, or something
 * that looks like a connection failure. A status-less programming error
 * (e.g. a TypeError while parsing an answer) is not retried — it would
 * only burn the attempt budget on a bug a retry can't fix.
 */
export function isRetryable(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number") return RETRYABLE_STATUS.has(status);

  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && RETRYABLE_CODES.has(code)) return true;
    if (error.name === "APIConnectionError") return true;
    if (error.name === "APIConnectionTimeoutError") return true;
  }

  const name = (error as { name?: unknown } | null)?.name;
  return (
    status === undefined &&
    typeof name === "string" &&
    name.endsWith("ConnectionError")
  );
}

/** `retry-after`, in ms, when the server named one. */
export function retryAfterMs(error: unknown): number | null {
  const headers = (error as { headers?: unknown } | null)?.headers;
  const raw =
    headers instanceof Headers
      ? headers.get("retry-after")
      : typeof headers === "object" && headers !== null
        ? ((headers as Record<string, unknown>)["retry-after"] ?? null)
        : null;
  if (typeof raw !== "string") return null;
  const seconds = Number.parseFloat(raw);
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : null;
}

/**
 * Exponential backoff with full jitter, honouring `retry-after`. Letting a 429
 * fall through would score the cell wrong; the runner still marks a cell
 * errored once the attempts are gone.
 */
export function withRetry(
  transport: Transport,
  options: RetryOptions = {},
): Transport {
  const {
    attempts = 4,
    baseDelayMs = 1000,
    maxDelayMs = 60_000,
    sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    random = Math.random,
  } = options;

  return async (request) => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await transport(request);
      } catch (error) {
        lastError = error;
        if (attempt === attempts || !isRetryable(error)) throw error;
        const capped = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
        await sleep(retryAfterMs(error) ?? random() * capped);
      }
    }
    throw lastError;
  };
}
