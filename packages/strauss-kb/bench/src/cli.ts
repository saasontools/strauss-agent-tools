import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { ARM_IDS, applyArm } from "./arms.js";
import { loadBundle } from "./bundle.js";
import { DEFAULT_MODEL_IDS, MODELS, projectCost } from "./models.js";
import { buildPrompt } from "./prompt.js";
import { renderJson, renderReport } from "./report.js";
import { runBench } from "./runner.js";
import { CORE_TASKS, TASKS, sampleTasks } from "./tasks.js";
import { anthropicTransport } from "./transport.js";
import type { ArmId, BenchTask } from "./model.js";
import type { CostProjection } from "./models.js";

const RESULTS_DIR = fileURLToPath(new URL("../results", import.meta.url));

/** Four characters per token -- close enough for a pre-flight, and never used
 * for a reported cost, which comes from the API's own `usage`. */
const CHARS_PER_TOKEN = 4;
const ESTIMATED_OUTPUT_TOKENS = 220;

/** Every flag, with the line `--help` prints for it. */
const FLAG_HELP: Record<string, string> = {
  full: `every arm and model over all ${TASKS.length} questions`,
  estimate: "print the projected cost and exit without calling anything",
  "arms=A,B": `arms to run (default A,B; --full runs ${ARM_IDS.join(",")})`,
  "models=<id,...>": "model ids to run (default the first; --full runs both)",
  "tasks=<n>": `how many questions to sample, 1-${TASKS.length}`,
  "concurrency=<n>": "calls in flight, 1-32 (default 4)",
  "out=<dir>": "where the .md and .json results are written",
  help: "this list",
};

const KNOWN_FLAGS = new Set(
  Object.keys(FLAG_HELP).map((flag) => flag.split("=", 1)[0] as string),
);

export class CliUsageError extends Error {}

export type CliOptions = {
  help: boolean;
  full: boolean;
  estimateOnly: boolean;
  arms: ArmId[];
  models: string[];
  taskCount: number;
  outDir: string;
  concurrency: number;
};

/**
 * Parses argv, rejecting anything it does not recognise. A typo in
 * `--arms=A,E` or `--models=claude-sonet-5` would otherwise be discovered after
 * the bill rather than before it.
 */
export function parseArgs(argv: readonly string[]): CliOptions {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    if (arg === "--") continue;
    if (!arg.startsWith("--")) {
      throw new CliUsageError(
        `unexpected argument ${arg}. Flags take the form --name or --name=value.`,
      );
    }
    const [key = "", value] = arg.slice(2).split("=", 2);
    if (!KNOWN_FLAGS.has(key)) {
      throw new CliUsageError(
        `unknown flag --${key}. Valid flags: ${[...KNOWN_FLAGS]
          .map((flag) => `--${flag}`)
          .join(", ")}.`,
      );
    }
    flags.set(key, value ?? "true");
  }

  const full = flags.get("full") === "true";

  const armList = flags.get("arms");
  // A smoke run is the two arms the hypothesis is about: the flagged bundle
  // and the untyped-plus-instruction control.
  const arms = (
    armList ? armList.split(",") : full ? [...ARM_IDS] : ["A", "B"]
  ).map((arm) => arm.trim().toUpperCase());
  for (const arm of arms) {
    if (!(ARM_IDS as readonly string[]).includes(arm)) {
      throw new CliUsageError(
        `unknown arm "${arm}". Valid arms: ${ARM_IDS.join(", ")}.`,
      );
    }
  }
  if (new Set(arms).size !== arms.length) {
    throw new CliUsageError(
      `--arms lists the same arm twice: ${arms.join(",")}.`,
    );
  }

  const modelList = flags.get("models");
  const models = modelList
    ? modelList.split(",").map((model) => model.trim())
    : full
      ? [...DEFAULT_MODEL_IDS]
      : [DEFAULT_MODEL_IDS[0] ?? "claude-sonnet-5"];
  for (const model of models) {
    if (!MODELS.some((known) => known.id === model)) {
      throw new CliUsageError(
        `unknown model "${model}". Valid models: ${DEFAULT_MODEL_IDS.join(", ")}. ` +
          "Add it to bench/src/models.ts with its rates before running it.",
      );
    }
  }

  const taskCount = numeric(
    flags.get("tasks"),
    full ? TASKS.length : 4,
    "--tasks",
    {
      min: 1,
      max: TASKS.length,
    },
  );
  const concurrency = numeric(flags.get("concurrency"), 4, "--concurrency", {
    min: 1,
    max: 32,
  });

  return {
    help: flags.get("help") === "true",
    full,
    estimateOnly: flags.get("estimate") === "true",
    arms: arms as ArmId[],
    models,
    taskCount,
    outDir: flags.get("out") ?? RESULTS_DIR,
    concurrency,
  };
}

function numeric(
  raw: string | undefined,
  fallback: number,
  flag: string,
  bounds: { min: number; max: number },
): number {
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < bounds.min || value > bounds.max) {
    throw new CliUsageError(
      `${flag} must be an integer between ${bounds.min} and ${bounds.max}; got "${raw}".`,
    );
  }
  return value;
}

export type Projection = {
  calls: number;
  prefixTokens: number;
  tailTokens: number;
  byModel: Array<[string, CostProjection]>;
};

/**
 * What the run would cost before it runs. Priced against the widest arm, and
 * reported cached and uncached because only the second is a bound.
 */
export function estimate(
  options: CliOptions,
  tasks: readonly BenchTask[],
  prefixChars: number,
  tailChars: number,
): Projection {
  const prefixTokens = Math.ceil(prefixChars / CHARS_PER_TOKEN);
  const tailTokens = Math.ceil(tailChars / CHARS_PER_TOKEN);
  const shape = {
    prefixTokens,
    tailTokens,
    outputTokens: ESTIMATED_OUTPUT_TOKENS,
    callsPerPrefix: tasks.length,
    prefixes: options.arms.length,
  };

  return {
    calls: options.arms.length * tasks.length * options.models.length,
    prefixTokens,
    tailTokens,
    byModel: options.models.map((model) => [model, projectCost(model, shape)]),
  };
}

export async function main(argv: readonly string[]): Promise<number> {
  const write = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };

  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof CliUsageError)) throw error;
    write(`bench: ${error.message}`);
    return 2;
  }

  if (options.help) {
    write("pnpm bench -- [flags]");
    for (const [flag, description] of Object.entries(FLAG_HELP)) {
      write(`  --${flag.padEnd(18)} ${description}`);
    }
    return 0;
  }

  const records = await loadBundle();
  const tasks = options.full ? TASKS : sampleTasks(options.taskCount);
  const sample = tasks[0] ?? CORE_TASKS[0]!;

  const prompts = options.arms.map((arm) =>
    buildPrompt(applyArm(records, arm), sample),
  );
  const projection = estimate(
    options,
    tasks,
    Math.max(...prompts.map((prompt) => prompt.bundlePrefix.length)),
    Math.max(...prompts.map((prompt) => prompt.question.length)),
  );

  write(
    `arms ${options.arms.join(",")} | models ${options.models.join(",")} | ` +
      `${tasks.length} questions | ${projection.calls} calls`,
  );
  write(
    `~${projection.prefixTokens.toLocaleString("en-US")} cached prefix tokens per arm, ` +
      `~${projection.tailTokens} uncached per call`,
  );
  for (const [model, cost] of projection.byModel) {
    write(
      `  ${model}: ~$${cost.cached.toFixed(2)} with the prefix cached, ` +
        `~$${cost.uncached.toFixed(2)} if it never hits` +
        (cost.prefixCaches
          ? ""
          : " (prefix is under this model's minimum cacheable size, so it will not cache)"),
    );
  }

  if (options.estimateOnly) return 0;

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    write(
      "No ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN in the environment, so " +
        "nothing was called. Re-run with credentials, or `pnpm test` for the " +
        "dry-run suite.",
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
          `${cell.errored ? `ERROR ${cell.error}` : cell.scored.correct ? "ok" : "miss"}`,
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
