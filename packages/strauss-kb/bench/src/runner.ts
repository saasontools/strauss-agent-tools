import { applyArm } from "./arms.js";
import { buildPrompt } from "./prompt.js";
import { scoreAnswer } from "./rubric.js";
import { bootstrapCi, bootstrapPairedDiff } from "./stats.js";
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
    maxTokens = 2000,
    bootstrapIterations = 10_000,
    onCell,
  } = options;

  const startedAt = new Date().toISOString();
  const bundles = new Map(arms.map((arm) => [arm, applyArm(records, arm)]));

  type Job = { arm: ArmId; model: string; task: BenchTask };
  const jobs: Job[] = [];
  for (const model of models) {
    // Arm-major within a model: an arm's questions run back to back, which is
    // what keeps its cached prefix warm.
    for (const arm of arms) {
      for (const task of tasks) jobs.push({ arm, model, task });
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
      const base = {
        arm: job.arm,
        model: job.model,
        taskId: job.task.id,
        taskType: job.task.type,
        taskFamily: job.task.family,
      };

      let cell: BenchCell;
      try {
        const response = await transport({
          model: job.model,
          system: prompt.system,
          bundle: prompt.bundlePrefix,
          question: prompt.question,
          maxTokens,
        });
        cell = {
          ...base,
          answer: response.answer,
          scored: scoreAnswer(response.answer, job.task.rubric),
          usage: response.usage,
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

const outcomes = (cells: readonly BenchCell[]): number[] =>
  cells.map((cell) => (cell.scored.correct ? 1 : 0));

/** Per (arm, model) accuracy with a bootstrap interval, plus breakdowns. */
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
      const ci = (subset: readonly BenchCell[]) =>
        bootstrapCi(outcomes(subset), { iterations: bootstrapIterations });

      const byType = Object.fromEntries(
        TASK_TYPES.map((type) => {
          const forType = answered.filter((cell) => cell.taskType === type);
          return [
            type,
            {
              n: forType.length,
              correct: forType.filter((cell) => cell.scored.correct).length,
            },
          ];
        }),
      ) as ArmSummary["byType"];

      return {
        arm: arm as ArmId,
        model,
        n: answered.length,
        errored: bucket.length - answered.length,
        accuracy: ci(answered),
        coreAccuracy: ci(answered.filter((cell) => cell.taskFamily === "core")),
        standingOnlyAccuracy: ci(
          answered.filter((cell) => cell.taskFamily === "standing-only"),
        ),
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
 * question leaves the pairing entirely if either arm failed it.
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

  for (const model of models) {
    const forModel = cells.filter(
      (cell) => cell.model === model && !cell.errored,
    );
    const byArm = new Map(
      arms.map((arm) => [
        arm,
        new Map(
          forModel
            .filter((cell) => cell.arm === arm)
            .map((cell) => [cell.taskId, cell]),
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
        for (const [taskId, baseCell] of [...base.entries()].sort()) {
          const otherCell = other.get(taskId);
          if (!otherCell) continue;
          if (family !== "all" && baseCell.taskFamily !== family) continue;
          left.push(baseCell.scored.correct ? 1 : 0);
          right.push(otherCell.scored.correct ? 1 : 0);
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
