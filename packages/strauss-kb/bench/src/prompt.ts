import type { ArmBundle } from "./arms.js";
import type { BenchTask, ModelAnswer } from "./model.js";

/** The name of the forced tool. Forcing it is what makes the answer parseable. */
export const ANSWER_TOOL_NAME = "submit_answer";

/**
 * The answer schema, stated once and used twice: as the forced tool's input
 * schema and, in prose, inside the prompt. Both, because the rubric is code --
 * a free-text answer would need a judge model, and a judge model is another
 * variable in an experiment that already has four arms.
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
        "the question. No explanation, no hedging. Empty string if the notes " +
        "do not settle the question.",
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

export type BenchPrompt = {
  system: string;
  user: string;
};

/**
 * Assembles the prompt for one (arm, task) pair.
 *
 * The bundle comes first and the question last, so a run against the real API
 * can cache the arm's prefix across all thirty questions.
 */
export function buildPrompt(bundle: ArmBundle, task: BenchTask): BenchPrompt {
  const sections = [
    "# Project notes",
    "",
    renderBundle(bundle),
    "",
    "# Question",
    "",
    task.question,
  ];

  if (bundle.instruction) {
    sections.splice(3, 0, "", `> ${bundle.instruction}`);
  }

  return { system: SYSTEM_PROMPT, user: sections.join("\n") };
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
