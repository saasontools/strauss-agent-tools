/**
 * Structural subset of the SDK's Interaction resource — everything this
 * server consumes. Kept local so extraction helpers and mock fixtures don't
 * fight the SDK's method-overload/namespace types; real SDK responses assign
 * to these structurally.
 */

export const TERMINAL_STATUSES = [
  "completed",
  "failed",
  "cancelled",
  "incomplete",
  "budget_exceeded",
] as const;

/** Statuses where a (possibly partial) report may exist and is fetchable. */
export const REPORT_STATUSES = [
  "completed",
  "incomplete",
  "budget_exceeded",
] as const;

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function mayHaveReport(status: string): boolean {
  return (REPORT_STATUSES as readonly string[]).includes(status);
}

export interface UrlCitation {
  url: string;
  title?: string;
}

export interface AnnotationLike {
  type?: string;
  url?: string;
  title?: string;
}

export interface ContentPartLike {
  type?: string;
  text?: string;
  annotations?: AnnotationLike[];
}

export interface StepLike {
  type?: string;
  /** model_output steps */
  content?: ContentPartLike[];
  /** thought steps */
  summary?: ContentPartLike[];
}

export interface UsageLike {
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_thought_tokens?: number;
  total_cached_tokens?: number;
  grounding_tool_count?: Array<{ [key: string]: unknown }>;
}

export interface InteractionLike {
  id: string;
  status: string;
  created?: string;
  updated?: string;
  output_text?: string;
  steps?: StepLike[];
  errors?: Array<{ code?: string; message?: string }>;
  usage?: UsageLike;
  previous_interaction_id?: string;
}
