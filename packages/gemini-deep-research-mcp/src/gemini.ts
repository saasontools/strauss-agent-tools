import { GoogleGenAI, ApiError } from "@google/genai";
import { AGENTS, getApiKey, getBaseUrl, type Depth } from "./config.js";
import { redact } from "./logger.js";
import type { InteractionLike } from "./types.js";

/**
 * Thin wrapper around client.interactions with no MCP concepts in it.
 * Everything here is unit-testable by pointing GEMINI_DEEP_RESEARCH_BASE_URL
 * at a local mock HTTP server.
 */

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly kind:
      "auth" | "rate_limited" | "bad_request" | "unreachable" | "api",
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export const AUTH_HELP =
  "GEMINI_API_KEY is missing or invalid. Get one at " +
  "https://aistudio.google.com/apikey and set it in your MCP client config.";

let client: GoogleGenAI | undefined;

/** Test hook: drop the cached client (e.g. after changing env config). */
export function resetClient(): void {
  client = undefined;
}

function getClient(): GoogleGenAI {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new GeminiError(AUTH_HELP, "auth");
  }
  if (!client) {
    const baseUrl = getBaseUrl();
    client = new GoogleGenAI({
      apiKey,
      httpOptions: {
        ...(baseUrl ? { baseUrl } : {}),
        timeout: 30_000,
        // SDK-native retries; do not hand-roll a retry loop on top.
        retryOptions: {
          attempts: 4,
          initialDelay: 500,
          maxDelay: 8_000,
          expBase: 2,
          jitter: 0.3,
          httpStatusCodes: [408, 429, 500, 502, 503, 504],
        },
      },
    });
  }
  return client;
}

/** Maps SDK/network failures to actionable, non-leaking messages. The remedy
 * for "could not reach the API" is completely different from "the research
 * failed", so the two are kept distinct. */
export function mapError(err: unknown, context: string): GeminiError {
  if (err instanceof GeminiError) return err;
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      return new GeminiError(AUTH_HELP, "auth");
    }
    if (err.status === 429) {
      const retryAfter = /retry[- ]?after[^0-9]*([0-9.]+)/i.exec(
        err.message,
      )?.[1];
      return new GeminiError(
        `Rate limited by the Gemini API; the ${context} request was NOT started.` +
          (retryAfter ? ` Retry after ~${retryAfter}s.` : " Retry shortly."),
        "rate_limited",
      );
    }
    if (err.status === 400) {
      return new GeminiError(
        `The Gemini API rejected the ${context} request (HTTP 400) — most often an ` +
          `unsupported agent name. Valid agents: ${AGENTS.standard} (standard) and ` +
          `${AGENTS.max} (max). Detail: ${redact(err.message)}`,
        "bad_request",
      );
    }
    return new GeminiError(
      `Gemini API error (HTTP ${err.status}) during ${context}: ${redact(err.message)}`,
      "api",
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return new GeminiError(
    `Could not reach the Gemini API during ${context} (network/timeout). ` +
      `The research itself did not fail — check connectivity and retry. ` +
      `Detail: ${redact(message)}`,
    "unreachable",
  );
}

export interface StartOptions {
  query: string;
  depth: Depth;
  thinkingSummaries?: boolean;
  visualization?: boolean;
  collaborativePlanning?: boolean;
  previousInteractionId?: string;
}

export async function startResearch(
  options: StartOptions,
): Promise<InteractionLike> {
  try {
    const interaction = await getClient().interactions.create({
      input: options.query,
      agent: AGENTS[options.depth],
      background: true,
      store: true,
      ...(options.previousInteractionId
        ? { previous_interaction_id: options.previousInteractionId }
        : {}),
      agent_config: {
        type: "deep-research",
        thinking_summaries:
          options.thinkingSummaries === false ? "none" : "auto",
        visualization: options.visualization ? "auto" : "off",
        collaborative_planning: options.collaborativePlanning ?? false,
      },
    });
    return interaction as unknown as InteractionLike;
  } catch (err) {
    throw mapError(err, "start");
  }
}

export interface ReplyOptions {
  previousInteractionId: string;
  message: string;
  depth: Depth;
  /** Per Google's docs the follow-up turn must explicitly set
   * collaborative_planning: false or the run stays in planning forever. */
  keepPlanning?: boolean;
}

export async function replyResearch(
  options: ReplyOptions,
): Promise<InteractionLike> {
  try {
    const interaction = await getClient().interactions.create({
      input: options.message,
      agent: AGENTS[options.depth],
      background: true,
      store: true,
      previous_interaction_id: options.previousInteractionId,
      agent_config: {
        type: "deep-research",
        thinking_summaries: "auto",
        collaborative_planning: options.keepPlanning ?? false,
      },
    });
    return interaction as unknown as InteractionLike;
  } catch (err) {
    throw mapError(err, "reply");
  }
}

export async function getInteraction(id: string): Promise<InteractionLike> {
  try {
    const interaction = await getClient().interactions.get(id);
    return interaction as unknown as InteractionLike;
  } catch (err) {
    throw mapError(err, "status");
  }
}

export async function cancelInteraction(id: string): Promise<InteractionLike> {
  try {
    const interaction = await getClient().interactions.cancel(id);
    return interaction as unknown as InteractionLike;
  } catch (err) {
    throw mapError(err, "cancel");
  }
}
