import type { ArmBundle } from "./arms.js";
import type { BenchTask, ModelAnswer } from "./model.js";

/** The name of the forced tool. Forcing it is what makes the answer parseable. */
export const ANSWER_TOOL_NAME = "submit_answer";

/**
 * The answer schema, stated once and used twice: as the forced tool's input
 * schema and, in prose, inside the prompt. Both, because the rubric is code and
 * a free-text answer would need a judge model.
 */
export const ANSWER_TOOL_SCHEMA = {
  type: "object",
  properties: {
    answer: {
      type: "string",
      description: "One or two sentences answering the question.",
    },
    value: {
      type: "string",
      description:
        "The shortest phrase, number, or comma-separated list that answers " +
        "the question. Write counts as digits. No explanation, no hedging. " +
        "Empty string if the notes do not settle the question.",
    },
    actionable: {
      type: "boolean",
      description:
        "True if the notes settle the question well enough to act on now. " +
        "False if the notes leave it unsettled and a human has to decide.",
    },
    concept_ids: {
      type: "array",
      items: { type: "string" },
      description: "The ids of the notes the answer rests on.",
    },
  },
  required: ["answer", "value", "actionable", "concept_ids"],
  additionalProperties: false,
} as const;

export const SYSTEM_PROMPT = [
  "You are helping an engineer act on a software project's written notes.",
  "",
  "Answer only from the notes below. Do not use outside knowledge about the",
  "technologies named, and do not guess at anything the notes leave open.",
  "",
  `Always answer by calling the ${ANSWER_TOOL_NAME} tool. Never answer in prose.`,
].join("\n");

/** Renders one record. Same shape in every arm; only the field list differs. */
export function renderRecord(record: ArmBundle["records"][number]): string {
  const head = [
    `### ${record.conceptId}`,
    ...record.fields.map(([label, value]) => `${label}: ${value}`),
  ].join("\n");
  const body =
    record.body === null
      ? "(body withheld: this note has been replaced and no longer holds)"
      : record.body;
  return `${head}\n\n${body}`;
}

export function renderBundle(bundle: ArmBundle): string {
  return bundle.records.map(renderRecord).join("\n\n---\n\n");
}

/** How the model is told to fill each field. Constant, so it stays cacheable. */
export const ANSWER_INSTRUCTIONS = [
  `Answer by calling ${ANSWER_TOOL_NAME} with:`,
  "",
  "- answer: one or two sentences.",
  "- value: the shortest phrase, number, or comma-separated list that answers",
  "  the question. Write counts as digits. No explanation, no hedging. Leave it",
  "  empty if the notes do not settle the question.",
  "- actionable: true if the notes settle the question well enough to act on",
  "  now; false if they leave it unsettled and a human has to decide.",
  "- concept_ids: the ids of the notes your answer rests on.",
].join("\n");

/**
 * The prompt for one (arm, task) pair, split at the cache breakpoint:
 * `bundlePrefix` is constant within an arm, `question` varies per call. Sent as
 * two content blocks so an arm's questions write the prefix once and read it
 * back thereafter.
 */
export type BenchPrompt = {
  system: string;
  bundlePrefix: string;
  question: string;
  /** The two blocks concatenated -- what the model effectively reads. */
  user: string;
};

export function buildPrompt(bundle: ArmBundle, task: BenchTask): BenchPrompt {
  const prefix = ["# Project notes", "", renderBundle(bundle)];
  if (bundle.instruction) {
    prefix.push("", `> ${bundle.instruction}`);
  }

  const question = [
    "# Question",
    "",
    task.question,
    "",
    ANSWER_INSTRUCTIONS,
  ].join("\n");
  const bundlePrefix = prefix.join("\n");

  return {
    system: SYSTEM_PROMPT,
    bundlePrefix,
    question,
    user: `${bundlePrefix}\n\n${question}`,
  };
}

/** Normalizes a tool-call payload into the answer shape the rubric scores. */
export function parseAnswer(input: unknown): ModelAnswer | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.answer !== "string") return null;
  if (typeof raw.value !== "string") return null;
  if (typeof raw.actionable !== "boolean") return null;
  const ids = Array.isArray(raw.concept_ids) ? raw.concept_ids : [];
  return {
    answer: raw.answer,
    value: raw.value,
    actionable: raw.actionable,
    conceptIds: ids.filter((id): id is string => typeof id === "string"),
  };
}
