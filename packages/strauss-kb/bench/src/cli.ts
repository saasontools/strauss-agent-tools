import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { ARM_IDS, applyArm } from "./arms.js";
import { loadBundle } from "./bundle.js";
import { DEFAULT_MODEL_IDS, estimateCost } from "./models.js";
import { buildPrompt } from "./prompt.js";
import { renderJson, renderReport } from "./report.js";
import { runBench } from "./runner.js";
import { sampleTasks, TASKS } from "./tasks.js";
import { anthropicTransport } from "./transport.js";
import type { ArmId } from "./model.js";

const RESULTS_DIR = fileURLToPath(new URL("../results", import.meta.url));

/** Tokens per assembled prompt, used only for the pre-flight estimate. */
const CHARS_PER_TOKEN = 4;
const ESTIMATED_OUTPUT_TOKENS = 220;

export type CliOptions = {
  full: boolean;
  estimateOnly: boolean;
  arms: ArmId[];
  models: string[];
  taskCount: number;
  outDir: string;
  concurrency: number;
};

export function parseArgs(argv: readonly string[]): CliOptions {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key = "", value] = arg.slice(2).split("=", 2);
    flags.set(key, value ?? "true");
  }

  const full = flags.get("full") === "true";
  const armList = flags.get("arms");
  const modelList = flags.get("models");
  const tasks = flags.get("tasks");

  return {
    full,
    estimateOnly: flags.get("estimate") === "true",
    // A smoke run is the two arms the hypothesis is actually about: the
    // flagged bundle and the untyped-plus-instruction control.
    arms: (armList ? armList.split(",") : full ? [...ARM_IDS] : ["A", "B"]).map(
      (arm) => arm.trim().toUpperCase() as ArmId,
    ),
    models: modelList
      ? modelList.split(",").map((model) => model.trim())
      : full
        ? [...DEFAULT_MODEL_IDS]
        : [DEFAULT_MODEL_IDS[0] ?? "claude-sonnet-5"],
    taskCount: tasks ? Number.parseInt(tasks, 10) : full ? TASKS.length : 4,
    outDir: flags.get("out") ?? RESULTS_DIR,
    concurrency: Number.parseInt(flags.get("concurrency") ?? "4", 10),
  };
}

/** What the run would cost before it runs. Also the answer for the full matrix. */
export function estimate(
  options: CliOptions,
  promptChars: number,
): {
  calls: number;
  inputTokensPerCall: number;
  costByModel: Array<[string, number]>;
} {
  const calls = options.arms.length * options.taskCount;
  const inputTokensPerCall = Math.ceil(promptChars / CHARS_PER_TOKEN);
  return {
    calls: calls * options.models.length,
    inputTokensPerCall,
    costByModel: options.models.map((model) => [
      model,
      estimateCost(model, calls, inputTokensPerCall, ESTIMATED_OUTPUT_TOKENS),
    ]),
  };
}

export async function main(argv: readonly string[]): Promise<number> {
  const options = parseArgs(argv);
  const records = await loadBundle();
  const tasks = options.full ? TASKS : sampleTasks(options.taskCount);

  // Estimate against the widest arm, so the number is never an undercount.
  const widest = Math.max(
    ...options.arms.map(
      (arm) =>
        buildPrompt(applyArm(records, arm), tasks[0] ?? TASKS[0]!).user.length,
    ),
  );
  const projection = estimate({ ...options, taskCount: tasks.length }, widest);

  const write = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };

  write(
    `arms ${options.arms.join(",")} | models ${options.models.join(",")} | ` +
      `${tasks.length} questions | ${projection.calls} calls`,
  );
  write(
    `~${projection.inputTokensPerCall.toLocaleString("en-US")} input tokens per call; ` +
      projection.costByModel
        .map(([model, cost]) => `${model} ~$${cost.toFixed(2)}`)
        .join(", "),
  );

  if (options.estimateOnly) return 0;

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    write(
      "No ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN in the environment. " +
        "Nothing was called. Re-run with credentials, or run `pnpm test` for the " +
        "dry-run suite, which exercises prompt assembly and scoring without a model.",
    );
    return 1;
  }

  let done = 0;
  const run = await runBench({
    records,
    tasks,
    arms: options.arms,
    models: options.models,
    transport: anthropicTransport(),
    concurrency: options.concurrency,
    onCell: (cell) => {
      done += 1;
      write(
        `[${done}/${projection.calls}] ${cell.model} ${cell.arm} ${cell.taskId} ` +
          `${cell.error ? `ERROR ${cell.error}` : cell.scored.correct ? "ok" : "miss"}`,
      );
    },
  });

  await mkdir(options.outDir, { recursive: true });
  const stamp = run.startedAt.replace(/[:.]/g, "-");
  const label = options.full ? "full" : "smoke";
  await writeFile(
    join(options.outDir, `${label}-${stamp}.md`),
    renderReport(run),
    "utf8",
  );
  await writeFile(
    join(options.outDir, `${label}-${stamp}.json`),
    renderJson(run),
    "utf8",
  );

  write("");
  write(renderReport(run));
  return 0;
}
