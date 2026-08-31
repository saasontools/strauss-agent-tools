/**
 * Shared vocabulary for the standing-fields control-arm benchmark.
 *
 * The benchmark asks one question: does a machine-readable standing field
 * change what an agent does, or would an untyped note plus a "be careful"
 * instruction get there too? Everything here exists to make that comparison
 * mechanical -- the arms differ only in which fields survive into the prompt,
 * and the rubric is code rather than a judge model.
 */

/** The four prompt conditions. See `arms.ts` for what each one strips. */
export type ArmId = "A" | "B" | "C" | "D";

/** What a question is probing for. Reported as a per-type breakdown. */
export type TaskType =
  "current-state" | "rejected-alternative" | "open-question" | "aggregation";

/**
 * One bundle record, flattened to the fields the arms manipulate.
 *
 * Deliberately not `KbRecord`: the arm transforms need every standing field
 * as a separate, individually removable thing, and the renderer needs a plain
 * body string rather than frontmatter it has to re-serialize.
 */
export type BenchRecord = {
  conceptId: string;
  type: string;
  title: string;
  status: string;
  supersedes: string[];
  supersededBy: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
  materiality: string | null;
  confidence: string | null;
  owner: string | null;
  recordedAt: string | null;
  tags: string[];
  body: string;
};

/** The structured answer every model is forced to return. */
export type ModelAnswer = {
  /** One or two sentences of prose. Not scored -- kept for reading runs. */
  answer: string;
  /** The shortest phrase, number, or list that answers the question. */
  value: string;
  /** Whether the notes settle the question well enough to act on. */
  actionable: boolean;
  /** The record ids the answer rests on. */
  conceptIds: string[];
};

/**
 * The expected behaviour for one question, as checks a function can run.
 *
 * Every field present must hold; absent fields are not checked. Patterns are
 * strings rather than `RegExp` so a rubric round-trips through JSON when a
 * result file is written.
 */
export type Rubric = {
  /** `false` means the right move is to refuse and ask a human. */
  expectActionable: boolean;
  /** Case-insensitive patterns that must all match `value`. */
  valueIncludes?: string[];
  /** Case-insensitive patterns that must none of them match `value`. */
  valueExcludes?: string[];
  /** Ids the answer must cite. */
  citeAll?: string[];
  /** Ids the answer must not cite. */
  citeNone?: string[];
  /** Exact set equality against `conceptIds`. */
  conceptIdsEqual?: string[];
  /** The single number `value` must parse to. */
  numericValue?: number;
};

export type BenchTask = {
  id: string;
  type: TaskType;
  question: string;
  rubric: Rubric;
};

/** Per-check outcome, kept so a failure says which half of the rubric broke. */
export type ScoredAnswer = {
  correct: boolean;
  checks: Record<string, boolean>;
};

export type BenchCell = {
  arm: ArmId;
  model: string;
  taskId: string;
  taskType: TaskType;
  answer: ModelAnswer | null;
  scored: ScoredAnswer;
  inputTokens: number;
  outputTokens: number;
  error: string | null;
};

export type ConfidenceInterval = {
  mean: number;
  lower: number;
  upper: number;
};

export type ArmSummary = {
  arm: ArmId;
  model: string;
  n: number;
  accuracy: ConfidenceInterval;
  byType: Record<TaskType, { n: number; correct: number }>;
};

export type BenchRun = {
  startedAt: string;
  bundleRecordCount: number;
  cells: BenchCell[];
  summaries: ArmSummary[];
  totals: { inputTokens: number; outputTokens: number; calls: number };
};
