import { ARMS } from "./arms.js";
import {
  CACHE_READ_MULTIPLIER,
  CACHE_WRITE_MULTIPLIER,
  usageCost,
} from "./models.js";
import type { BenchRun, ConfidenceInterval, TaskType } from "./model.js";

const TYPE_ORDER: readonly TaskType[] = [
  "current-state",
  "rejected-alternative",
  "open-question",
  "aggregation",
];

const percent = (value: number): string =>
  Number.isNaN(value) ? "--" : `${(value * 100).toFixed(1)}%`;

const signedPercent = (value: number): string =>
  Number.isNaN(value)
    ? "--"
    : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}pp`;

const interval = (ci: ConfidenceInterval, signed = false): string => {
  const format = signed ? signedPercent : percent;
  return `${format(ci.mean)} [${format(ci.lower)}, ${format(ci.upper)}]`;
};

/** A markdown report: per-arm accuracy, the paired differences, and the bill. */
export function renderReport(run: BenchRun): string {
  const lines: string[] = [
    "# Standing-fields control-arm benchmark",
    "",
    `Transport: ${run.transport}` +
      (run.transportVersion ? ` (Claude Code ${run.transportVersion})` : "") +
      `. Thinking tokens: ${run.totals.thinkingTokens.toLocaleString("en-US")}` +
      (run.totals.thinkingTokens === 0
        ? " -- thinking was off, so the arms differ in the prompt only."
        : " -- NOT zero, so some of the gap may be reasoning rather than fields."),
    "",
    `Started ${run.startedAt}, finished ${run.finishedAt}. ` +
      `Bundle: ${run.bundleRecordCount} records. ${run.totals.calls} model calls` +
      (run.totals.errored
        ? `, ${run.totals.errored} errored and excluded.`
        : "."),
    "",
    "## Arm A minus each control, paired on the question",
    "",
    "The headline is the `core` row: questions whose ground truth lives in",
    "record content and therefore survives every arm. `standing-only` questions",
    "ask about a field arms B, C, or D never received, so their gap measures the",
    "deletion rather than any behaviour.",
    "",
    "| model | comparison | family | pairs | A - X (95% CI) |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const diff of run.differences) {
    lines.push(
      `| ${diff.model} | A - ${diff.comparison} | ${diff.family} | ${diff.pairs} | ` +
        `${interval(diff.difference, true)} |`,
    );
  }

  lines.push("", "## Accuracy by arm", "");
  lines.push("| model | arm | condition | n | core | standing-only | all |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const summary of run.summaries) {
    lines.push(
      `| ${summary.model} | ${summary.arm} | ${ARMS[summary.arm].description} | ` +
        `${summary.n} | ${interval(summary.coreAccuracy)} | ` +
        `${interval(summary.standingOnlyAccuracy)} | ${interval(summary.accuracy)} |`,
    );
  }

  lines.push("", "## Accuracy by question type", "");
  lines.push(`| model | arm | ${TYPE_ORDER.join(" | ")} |`);
  lines.push(`| --- | --- | ${TYPE_ORDER.map(() => "---").join(" | ")} |`);
  for (const summary of run.summaries) {
    const cells = TYPE_ORDER.map((type) => {
      const bucket = summary.byType[type];
      return bucket.n === 0 ? "--" : `${bucket.correct}/${bucket.n}`;
    });
    lines.push(`| ${summary.model} | ${summary.arm} | ${cells.join(" | ")} |`);
  }

  const failures = run.cells.filter((cell) => cell.errored);
  if (failures.length) {
    lines.push(
      "",
      "## Calls that errored (excluded from every denominator)",
      "",
    );
    for (const cell of failures) {
      lines.push(
        `- ${cell.model} arm ${cell.arm} ${cell.taskId}: ${cell.error}`,
      );
    }
  }

  lines.push("", "## Spend", "");
  lines.push(
    ...(run.transport === "claude"
      ? [
          "List price for the tokens used, billed to the subscription: these",
          "calls spent quota, not dollars.",
          "",
        ]
      : []),
    `Cache writes bill at ${CACHE_WRITE_MULTIPLIER}x the base input rate, reads at ${CACHE_READ_MULTIPLIER}x.`,
    "A cache-read column near zero means the arm prefix is not caching -- check",
    "it against the model's minimum cacheable prefix before reading the cost as",
    "a surprise.",
    "",
  );
  lines.push(
    "| model | calls | input | cache write | cache read | output | cost |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");

  const byModel = new Map<
    string,
    {
      calls: number;
      input: number;
      write: number;
      read: number;
      output: number;
    }
  >();
  for (const cell of run.cells) {
    const entry = byModel.get(cell.model) ?? {
      calls: 0,
      input: 0,
      write: 0,
      read: 0,
      output: 0,
    };
    entry.calls += 1;
    entry.input += cell.usage.inputTokens;
    entry.write += cell.usage.cacheWriteTokens;
    entry.read += cell.usage.cacheReadTokens;
    entry.output += cell.usage.outputTokens;
    byModel.set(cell.model, entry);
  }

  const n = (value: number) => value.toLocaleString("en-US");
  let total = 0;
  for (const [modelId, entry] of byModel) {
    const cost = usageCost(modelId, {
      inputTokens: entry.input,
      cacheWriteTokens: entry.write,
      cacheReadTokens: entry.read,
      outputTokens: entry.output,
    });
    if (!Number.isNaN(cost)) total += cost;
    lines.push(
      `| ${modelId} | ${entry.calls} | ${n(entry.input)} | ${n(entry.write)} | ` +
        `${n(entry.read)} | ${n(entry.output)} | $${cost.toFixed(4)} |`,
    );
  }
  lines.push(
    `| **total** | ${run.totals.calls} | | | | | $${total.toFixed(4)} |`,
  );

  return `${lines.join("\n")}\n`;
}

/** The same run as data, for a later pass that wants the per-cell checks. */
export function renderJson(run: BenchRun): string {
  return `${JSON.stringify(run, null, 2)}\n`;
}
