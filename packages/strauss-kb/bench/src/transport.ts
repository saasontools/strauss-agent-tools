import { ANSWER_TOOL_NAME, ANSWER_TOOL_SCHEMA, parseAnswer } from "./prompt.js";
import type { ModelAnswer } from "./model.js";

export type BenchRequest = {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
};

export type BenchResponse = {
  answer: ModelAnswer | null;
  inputTokens: number;
  outputTokens: number;
};

/**
 * Everything the runner needs from a model.
 *
 * A function rather than a client, so the dry-run suite can assert on exactly
 * what would have been sent without a network stub, an interceptor, or a
 * recorded cassette to keep in sync.
 */
export type Transport = (request: BenchRequest) => Promise<BenchResponse>;

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
      return { answer: null, inputTokens: 0, outputTokens: 0 };
    }
    return {
      answer: {
        answer: canned.answer ?? "",
        value: canned.value ?? "",
        actionable: canned.actionable ?? true,
        conceptIds: canned.conceptIds ?? [],
      },
      inputTokens: request.user.length >> 2,
      outputTokens: 64,
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
 * Thinking is off and the answer tool is forced. Both for the same reason --
 * the experiment varies one thing, the fields in the prompt, and a model
 * choosing when to think or whether to answer in prose is variance the arms
 * would absorb.
 */
export function anthropicTransport(): Transport {
  let clientPromise: Promise<{
    messages: {
      create(body: unknown): Promise<unknown>;
    };
  }> | null = null;

  return async (request) => {
    clientPromise ??= import("@anthropic-ai/sdk").then(
      ({ default: Anthropic }) => new Anthropic(),
    );
    const client = await clientPromise;

    const response = (await client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens,
      system: [
        {
          type: "text",
          text: request.system,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [
        {
          name: ANSWER_TOOL_NAME,
          description: "Submit the structured answer to the question.",
          input_schema: ANSWER_TOOL_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: ANSWER_TOOL_NAME },
      messages: [{ role: "user", content: request.user }],
    })) as {
      content: Array<{ type: string; name?: string; input?: unknown }>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
    };

    const call = response.content.find(
      (block) => block.type === "tool_use" && block.name === ANSWER_TOOL_NAME,
    );

    const usage = response.usage ?? {};
    return {
      answer: call ? parseAnswer(call.input) : null,
      inputTokens:
        (usage.input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0),
      outputTokens: usage.output_tokens ?? 0,
    };
  };
}
