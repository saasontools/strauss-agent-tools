import { ARMS } from "./arms.js";
import { findModel } from "./models.js";
import type { BenchRun, TaskType } from "./model.js";

const TYPE_ORDER: readonly TaskType[] = [
  "current-state",
  "rejected-alternative",
  "open-question",
  "aggregation",
];

const percent = (value: number): string =>
  Number.isNaN(value) ? "--" : `${(value * 100).toFixed(1)}%`;

/** A markdown report: the per-arm table, the per-type breakdown, and the bill. */
export function renderReport(run: BenchRun): string {
  const lines: string[] = [
    "# Standing-fields control-arm benchmark",
    "",
    `Run started ${run.startedAt}. Bundle: ${run.bundleRecordCount} records. ` +
      `${run.totals.calls} model calls.`,
    "",
    "## Accuracy by arm",
    "",
    "| model | arm | condition | n | accuracy | 95% CI |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  for (const summary of run.summaries) {
    lines.push(
      `| ${summary.model} | ${summary.arm} | ${ARMS[summary.arm].description} | ` +
        `${summary.n} | ${percent(summary.accuracy.mean)} | ` +
        `${percent(summary.accuracy.lower)}-${percent(summary.accuracy.upper)} |`,
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

  const failures = run.cells.filter((cell) => cell.error !== null);
  if (failures.length) {
    lines.push("", "## Calls that errored", "");
    for (const cell of failures) {
      lines.push(
        `- ${cell.model} arm ${cell.arm} ${cell.taskId}: ${cell.error}`,
      );
    }
  }

  lines.push("", "## Spend", "");
  lines.push("| model | calls | input tokens | output tokens | cost |");
  lines.push("| --- | --- | --- | --- | --- |");
  const byModel = new Map<
    string,
    { calls: number; input: number; output: number }
  >();
  for (const cell of run.cells) {
    const entry = byModel.get(cell.model) ?? { calls: 0, input: 0, output: 0 };
    entry.calls += 1;
    entry.input += cell.inputTokens;
    entry.output += cell.outputTokens;
    byModel.set(cell.model, entry);
  }
  let total = 0;
  for (const [modelId, entry] of byModel) {
    const model = findModel(modelId);
    const cost = model
      ? (entry.input * model.inputPerMTok) / 1e6 +
        (entry.output * model.outputPerMTok) / 1e6
      : Number.NaN;
    if (!Number.isNaN(cost)) total += cost;
    lines.push(
      `| ${modelId} | ${entry.calls} | ${entry.input.toLocaleString("en-US")} | ` +
        `${entry.output.toLocaleString("en-US")} | $${cost.toFixed(4)} |`,
    );
  }
  lines.push(`| **total** | ${run.totals.calls} | | | $${total.toFixed(4)} |`);

  return `${lines.join("\n")}\n`;
}

/** The same run as data, for a later pass that wants the per-cell checks. */
export function renderJson(run: BenchRun): string {
  return `${JSON.stringify(run, null, 2)}\n`;
}
