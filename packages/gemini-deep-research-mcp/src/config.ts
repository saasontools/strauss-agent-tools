import { homedir } from "node:os";
import { join } from "node:path";

/**
 * All configuration is read lazily, never at import time: the server must
 * complete tools/list without a valid key so clients can start and display
 * the tools. Only tool invocation requires auth.
 */

export const AGENTS = {
  standard: "deep-research-preview-04-2026",
  max: "deep-research-max-preview-04-2026",
} as const;
export type Depth = keyof typeof AGENTS;

/** Approximate per-run cost, surfaced in tool descriptions and errors. */
export const COST_HINT: Record<Depth, string> = {
  standard: "~$1-3 per run",
  max: "~$3-7 per run",
};

export function getApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
}

export function getHomeDir(): string {
  return (
    process.env.GEMINI_DEEP_RESEARCH_HOME ??
    join(homedir(), ".gemini-deep-research-mcp")
  );
}

export function getDefaultDepth(): Depth {
  const raw = process.env.GEMINI_DEEP_RESEARCH_AGENT;
  return raw === "max" ? "max" : "standard";
}

/**
 * Testing/enterprise override for the Gemini API endpoint. Pointing this at a
 * local mock server makes the entire lifecycle drivable with no key and no
 * network — the integration suite is built on it.
 */
export function getBaseUrl(): string | undefined {
  return process.env.GEMINI_DEEP_RESEARCH_BASE_URL;
}
