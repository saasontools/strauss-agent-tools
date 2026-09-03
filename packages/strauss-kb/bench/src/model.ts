/**
 * Shared vocabulary for the standing-fields control-arm benchmark: does a
 * machine-readable standing field change what an agent does, or would an
 * untyped note plus a "be careful" instruction get there too? The arms differ
 * only in which fields survive into the prompt.
 */

/** The four prompt conditions. See `arms.ts` for what each one strips. */
export type ArmId = "A" | "B" | "C" | "D";

/** What a question is probing for. Reported as a per-type breakdown. */
export type TaskType =
  "current-state" | "rejected-alternative" | "open-question" | "aggregation";

/**
 * Whether a question is comparable across arms. `core` ground truth lives in
 * record *content*, which every arm sees; `standing-only` asks about a field
 * the transforms delete, so scoring it in the headline would inflate A-B by
 * construction. Only `core` feeds the headline.
 */
export type TaskFamily = "core" | "standing-only";

/**
 * One bundle record, flattened to the fields the arms manipulate. Not
 * `KbRecord`: the transforms need every standing field individually removable,
 * and the renderer needs a plain body string.
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
 * The expected behaviour for one question, as checks a function can run. Every
 * field present must hold; absent fields are not checked. Patterns are strings
 * rather than `RegExp` so a rubric round-trips through a JSON result file.
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
  family: TaskFamily;
  question: string;
  rubric: Rubric;
};

/** Per-check outcome, kept so a failure says which half of the rubric broke. */
export type ScoredAnswer = {
  correct: boolean;
  checks: Record<string, boolean>;
};

/** What one request cost, split the way the API bills it. */
export type CellUsage = {
  /** Uncached input, at the base rate. */
  inputTokens: number;
  /** Written to cache this call; billed at `CACHE_WRITE_MULTIPLIER`. */
  cacheWriteTokens: number;
  /** Served from cache; billed at `CACHE_READ_MULTIPLIER`. */
  cacheReadTokens: number;
  outputTokens: number;
};

export type BenchCell = {
  arm: ArmId;
  model: string;
  taskId: string;
  taskType: TaskType;
  taskFamily: TaskFamily;
  answer: ModelAnswer | null;
  scored: ScoredAnswer;
  usage: CellUsage;
  /**
   * The transport failed after its retries. An errored cell leaves the accuracy
   * denominator and the bootstrap, so a rate limit cannot read as a model
   * failure.
   */
  errored: boolean;
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
  /** Cells that produced an answer -- the accuracy denominator. */
  n: number;
  errored: number;
  accuracy: ConfidenceInterval;
  /** Headline: `core` questions only. */
  coreAccuracy: ConfidenceInterval;
  standingOnlyAccuracy: ConfidenceInterval;
  byType: Record<TaskType, { n: number; correct: number }>;
};

/**
 * A paired arm-vs-arm difference -- the quantity the experiment is about.
 * Resampling questions rather than cells removes the between-question variance
 * that dominates a 30-item set.
 */
export type ArmDifference = {
  model: string;
  baseline: ArmId;
  comparison: ArmId;
  family: TaskFamily | "all";
  /** Questions answered in both arms. */
  pairs: number;
  difference: ConfidenceInterval;
};

export type BenchRun = {
  startedAt: string;
  finishedAt: string;
  bundleRecordCount: number;
  cells: BenchCell[];
  summaries: ArmSummary[];
  differences: ArmDifference[];
  totals: {
    calls: number;
    errored: number;
    inputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
    outputTokens: number;
  };
};
