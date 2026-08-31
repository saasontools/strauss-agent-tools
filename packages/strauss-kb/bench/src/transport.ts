import { ANSWER_TOOL_NAME, ANSWER_TOOL_SCHEMA, parseAnswer } from "./prompt.js";
import type { CellUsage, ModelAnswer } from "./model.js";

export type BenchRequest = {
  model: string;
  system: string;
  /**
   * The arm's rendered bundle. Sent as its own content block carrying the
   * cache breakpoint: it is identical across every question in that arm, and
   * it is where all but a few hundred of the prompt's tokens live.
   */
  bundle: string;
  /** The question and the answer instructions. Varies per call, so it sits
   * after the breakpoint and is never cached. */
  question: string;
  maxTokens: number;
};

export type BenchResponse = {
  answer: ModelAnswer | null;
  usage: CellUsage;
};

/**
 * Everything the runner needs from a model.
 *
 * A function rather than a client, so the dry-run suite can assert on exactly
 * what would have been sent without a network stub, an interceptor, or a
 * recorded cassette to keep in sync.
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
 * A transport that answers from a function instead of a model.
 *
 * The function sees the whole assembled request, so a dry-run case can key its
 * canned answer off the question text, the arm's rendering, or both -- which
 * is how the suite checks that an arm's stripping actually reached the prompt.
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
 * The SDK is imported dynamically because it is a bench-only devDependency:
 * the dry-run suite, which is what CI runs, must not need it resolvable.
 *
 * Three deliberate choices:
 *
 * - **Thinking is off and the answer tool is forced.** The experiment varies
 *   one thing, the fields in the prompt. A model choosing when to think, or
 *   whether to answer in prose, is variance the arms would absorb.
 * - **The cache breakpoint sits on the bundle block, not the system prompt.**
 *   Caching is a prefix match over `tools` then `system` then `messages`, and
 *   a marker only caches what precedes it. The system prompt here is about
 *   sixty tokens -- under every model's minimum cacheable prefix (1024 on
 *   Sonnet 5, 4096 on Haiku 4.5), so a marker there caches nothing at all and
 *   reports `cache_creation_input_tokens: 0` without an error. The bundle is
 *   ~9k tokens and identical across an arm's questions, which is the prefix
 *   worth caching.
 * - **Default 5-minute TTL.** An arm's questions are issued back to back, so
 *   the start-to-start gap is seconds; the 1-hour TTL would double the write
 *   premium (2x rather than 1.25x) and buy nothing.
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

export function isRetryable(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number") return RETRYABLE_STATUS.has(status);
  // A connection error carries no status. Those are worth another attempt;
  // a 400 from a malformed schema is not, and would only burn the budget.
  return status === undefined;
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
 * Exponential backoff with full jitter, honouring `retry-after`.
 *
 * The alternative -- letting a 429 fall through to the runner -- would score
 * the cell wrong, and a rate limit is not a model failure. Retrying here keeps
 * that distinction where it belongs, and the runner still marks a cell errored
 * once the attempts are gone.
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
