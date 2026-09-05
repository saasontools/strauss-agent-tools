import { questionScores, meanStability } from "./aggregate.js";
import { applyArm } from "./arms.js";
import { buildPrompt } from "./prompt.js";
import { scoreAnswer } from "./rubric.js";
import {
  DEFAULT_SEED,
  bootstrapCi,
  bootstrapPairedDiff,
  deriveSeed,
} from "./stats.js";
import { EMPTY_USAGE } from "./transport.js";
import type {
  ArmDifference,
  ArmId,
  ArmSummary,
  BenchCell,
  BenchRecord,
  BenchRun,
  BenchTask,
  TaskFamily,
  TaskType,
  TransportId,
} from "./model.js";
import type { QuestionScore } from "./aggregate.js";
import type { Transport } from "./transport.js";

const TASK_TYPES: readonly TaskType[] = [
  "current-state",
  "rejected-alternative",
  "open-question",
  "aggregation",
];

export type RunOptions = {
  records: BenchRecord[];
  tasks: readonly BenchTask[];
  arms: readonly ArmId[];
  models: readonly string[];
  transport: Transport;
  /** Recorded on the run so a result file says how the calls were made. */
  transportId?: TransportId;
  /** The transport's own version, when it has one (the Claude Code CLI). */
  transportVersion?: string | null;
  /** In-flight calls. Kept low by default: the arms are not a load test. */
  concurrency?: number;
  /**
   * How many times to ask each (arm, model, question) cell. The score for the
   * cell is the mean over its repeats; the bootstrap still resamples
   * questions, so intervals tighten with repeats without three answers to one
   * question counting as three questions.
   */
  repeats?: number;
  /** Base for the per-repeat seeds. Recorded on the run. */
  seed?: number;
  maxTokens?: number;
  bootstrapIterations?: number;
  onCell?: (cell: BenchCell) => void;
};

/**
 * Runs the matrix and scores it.
 *
 * Every cell is independent, so a transport failure is recorded on the cell as
 * `errored` rather than thrown or scored wrong: a run that loses four calls to
 * a rate limit reports the other 236 over a denominator of 236.
 */
export async function runBench(options: RunOptions): Promise<BenchRun> {
  const {
    records,
    tasks,
    arms,
    models,
    transport,
    transportId = "api",
    transportVersion = null,
    concurrency = 4,
    repeats = 1,
    seed = DEFAULT_SEED,
    maxTokens = 2000,
    bootstrapIterations = 10_000,
    onCell,
  } = options;

  const startedAt = new Date().toISOString();
  const bundles = new Map(arms.map((arm) => [arm, applyArm(records, arm)]));

  type Job = { arm: ArmId; model: string; task: BenchTask; repeat: number };
  const jobs: Job[] = [];
  for (const model of models) {
    // Arm-major within a model: an arm's questions run back to back, which is
    // what keeps its cached prefix warm. Repeats are a pass over the same
    // question list, so the prefix stays warm across them too.
    for (const arm of arms) {
      for (let repeat = 0; repeat < Math.max(1, repeats); repeat += 1) {
        for (const task of tasks) jobs.push({ arm, model, task, repeat });
      }
    }
  }

  const cells: BenchCell[] = new Array(jobs.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next;
      next += 1;
      const job = jobs[index];
      if (!job) return;

      const bundle = bundles.get(job.arm);
      if (!bundle) throw new Error(`no bundle for arm ${job.arm}`);
      const prompt = buildPrompt(bundle, job.task);
      const cellSeed = deriveSeed(
        seed,
        job.model,
        job.arm,
        job.task.id,
        job.repeat,
      );
      const base = {
        arm: job.arm,
        model: job.model,
        taskId: job.task.id,
        taskType: job.task.type,
        taskFamily: job.task.family,
        repeat: job.repeat,
        seed: cellSeed,
      };

      let cell: BenchCell;
      try {
        const response = await transport({
          model: job.model,
          system: prompt.system,
          bundle: prompt.bundlePrefix,
          question: prompt.question,
          maxTokens,
          seed: cellSeed,
        });
        cell = {
          ...base,
          answer: response.answer,
          scored: scoreAnswer(response.answer, job.task.rubric),
          usage: response.usage,
          maxTokens:
            response.maxTokens === undefined ? maxTokens : response.maxTokens,
          // A transport that returns without an answer -- a refused tool call,
          // a truncated response -- is a real failure to answer, and is scored
          // as one. Only a thrown transport error leaves the denominator.
          errored: false,
          error: null,
        };
      } catch (error) {
        cell = {
          ...base,
          answer: null,
          scored: { correct: false, checks: { answered: false } },
          usage: EMPTY_USAGE,
          maxTokens: null,
          errored: true,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      cells[index] = cell;
      onCell?.(cell);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(concurrency, jobs.length)) },
      worker,
    ),
  );

  const scored = cells.filter((cell) => !cell.errored);
  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    repeats: Math.max(1, repeats),
    seed,
    transport: transportId,
    transportVersion,
    bundleRecordCount: records.length,
    cells,
    summaries: summarize(cells, bootstrapIterations),
    differences: pairedDifferences(cells, bootstrapIterations),
    totals: {
      calls: cells.length,
      errored: cells.length - scored.length,
      inputTokens: sum(cells, (cell) => cell.usage.inputTokens),
      cacheWriteTokens: sum(cells, (cell) => cell.usage.cacheWriteTokens),
      cacheReadTokens: sum(cells, (cell) => cell.usage.cacheReadTokens),
      outputTokens: sum(cells, (cell) => cell.usage.outputTokens),
      thinkingTokens: sum(cells, (cell) => cell.usage.thinkingTokens ?? 0),
    },
  };
}

const sum = (
  cells: readonly BenchCell[],
  of: (cell: BenchCell) => number,
): number => cells.reduce((total, cell) => total + of(cell), 0);

/**
 * Per (arm, model) accuracy with a bootstrap interval, plus breakdowns.
 *
 * Everything below runs on per-question means, not on calls: with repeats, a
 * question answered three times is still one draw from the question set.
 */
export function summarize(
  cells: readonly BenchCell[],
  bootstrapIterations = 10_000,
): ArmSummary[] {
  const groups = new Map<string, BenchCell[]>();
  for (const cell of cells) {
    const key = `${cell.model}\u0000${cell.arm}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(cell);
    groups.set(key, bucket);
  }

  return [...groups.entries()]
    .map(([key, bucket]): ArmSummary => {
      const [model = "", arm = "A"] = key.split("\u0000");
      const answered = bucket.filter((cell) => !cell.errored);
      const scores = questionScores(bucket);
      const ci = (subset: readonly QuestionScore[]) =>
        bootstrapCi(
          subset.map((score) => score.mean),
          { iterations: bootstrapIterations },
        );

      const byType = Object.fromEntries(
        TASK_TYPES.map((type) => {
          const forType = scores.filter((score) => score.taskType === type);
          return [
            type,
            {
              n: forType.length,
              correct: forType.reduce((total, score) => total + score.mean, 0),
            },
          ];
        }),
      ) as ArmSummary["byType"];

      return {
        arm: arm as ArmId,
        model,
        n: answered.length,
        questions: scores.length,
        errored: bucket.length - answered.length,
        accuracy: ci(scores),
        coreAccuracy: ci(scores.filter((score) => score.taskFamily === "core")),
        standingOnlyAccuracy: ci(
          scores.filter((score) => score.taskFamily === "standing-only"),
        ),
        stability: meanStability(scores),
        byType,
      };
    })
    .sort(
      (a, b) => a.model.localeCompare(b.model) || a.arm.localeCompare(b.arm),
    );
}

/**
 * Arm A minus every other arm, paired on the question, per model.
 *
 * `core` is the headline; `all` is reported alongside it, because an `all` much
 * larger than `core` means most of the gap is the standing-only questions. A
 * question leaves the pairing entirely if either arm lost every repeat of it to
 * a transport error; with repeats, each side of a pair is that question's mean.
 */
export function pairedDifferences(
  cells: readonly BenchCell[],
  bootstrapIterations = 10_000,
  baseline: ArmId = "A",
): ArmDifference[] {
  const models = [...new Set(cells.map((cell) => cell.model))].sort();
  const arms = [...new Set(cells.map((cell) => cell.arm))].sort();
  const families: Array<TaskFamily | "all"> = ["all", "core", "standing-only"];
  const differences: ArmDifference[] = [];

  const scores = questionScores(cells);
  for (const model of models) {
    const forModel = scores.filter((score) => score.model === model);
    const byArm = new Map(
      arms.map((arm) => [
        arm,
        new Map(
          forModel
            .filter((score) => score.arm === arm)
            .map((score) => [score.taskId, score]),
        ),
      ]),
    );
    const base = byArm.get(baseline);
    if (!base) continue;

    for (const arm of arms) {
      if (arm === baseline) continue;
      const other = byArm.get(arm);
      if (!other) continue;

      for (const family of families) {
        const left: number[] = [];
        const right: number[] = [];
        for (const [taskId, baseScore] of [...base.entries()].sort(([a], [b]) =>
          a.localeCompare(b),
        )) {
          const otherScore = other.get(taskId);
          if (!otherScore) continue;
          if (family !== "all" && baseScore.taskFamily !== family) continue;
          left.push(baseScore.mean);
          right.push(otherScore.mean);
        }
        if (left.length === 0) continue;
        differences.push({
          model,
          baseline,
          comparison: arm,
          family,
          pairs: left.length,
          difference: bootstrapPairedDiff(left, right, {
            iterations: bootstrapIterations,
          }),
        });
      }
    }
  }

  return differences;
}
