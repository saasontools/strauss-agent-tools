import { describe, expect, it } from "vitest";
import { loadBundle } from "./bundle.js";
import { ANSWER_TOOL_SCHEMA, SYSTEM_PROMPT, parseAnswer } from "./prompt.js";
import { estimate, parseArgs } from "./cli.js";
import { renderReport } from "./report.js";
import { runBench } from "./runner.js";
import { TASKS, sampleTasks } from "./tasks.js";
import { mockTransport } from "./transport.js";
import { bootstrapCi, mulberry32 } from "./stats.js";
import type { BenchRequest } from "./transport.js";

const records = await loadBundle();
const tasks = TASKS.slice(0, 4);

/**
 * A stand-in that answers correctly only when the prompt still carries the
 * supersession link -- the behaviour the benchmark is built to detect.
 */
const standingAwareAnswers = (request: BenchRequest) => {
  const sawStanding = request.user.includes("superseded_by:");
  if (request.user.includes("insurance-claim submission")) {
    return {
      value: sawStanding ? "NATS JetStream" : "Amazon SQS",
      actionable: true,
      conceptIds: ["decision.jetstream-queue-backend"],
    };
  }
  return { value: "", actionable: false, conceptIds: [] };
};

describe("runBench (dry run)", () => {
  it("runs every cell of the matrix exactly once", async () => {
    const transport = mockTransport(standingAwareAnswers);
    const run = await runBench({
      records,
      tasks,
      arms: ["A", "B", "C", "D"],
      models: ["mock-a", "mock-b"],
      transport,
      bootstrapIterations: 200,
    });

    expect(run.cells).toHaveLength(4 * 4 * 2);
    expect(transport.requests).toHaveLength(4 * 4 * 2);
    const keys = run.cells.map(
      (cell) => `${cell.model}|${cell.arm}|${cell.taskId}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(run.summaries).toHaveLength(8);
  });

  it("separates the arms on the question the arms are about", async () => {
    const run = await runBench({
      records,
      tasks: [TASKS[0]!],
      arms: ["A", "B", "C", "D"],
      models: ["mock"],
      transport: mockTransport(standingAwareAnswers),
      bootstrapIterations: 200,
    });

    const correctness = Object.fromEntries(
      run.cells.map((cell) => [cell.arm, cell.scored.correct]),
    );
    expect(correctness).toEqual({ A: true, B: false, C: false, D: false });
  });

  it("sends the same system prompt in every arm", async () => {
    const transport = mockTransport(standingAwareAnswers);
    await runBench({
      records,
      tasks: [TASKS[0]!],
      arms: ["A", "B", "C", "D"],
      models: ["mock"],
      transport,
      bootstrapIterations: 200,
    });
    for (const request of transport.requests) {
      expect(request.system).toBe(SYSTEM_PROMPT);
      expect(request.user).toContain(TASKS[0]!.question);
    }
  });

  it("records a transport failure on the cell instead of aborting the run", async () => {
    let calls = 0;
    const run = await runBench({
      records,
      tasks,
      arms: ["A"],
      models: ["mock"],
      transport: async () => {
        calls += 1;
        if (calls === 2) throw new Error("429 rate limited");
        return { answer: null, inputTokens: 1, outputTokens: 1 };
      },
      concurrency: 1,
      bootstrapIterations: 200,
    });

    expect(run.cells).toHaveLength(4);
    expect(run.cells.filter((cell) => cell.error !== null)).toHaveLength(1);
    expect(run.cells[1]?.error).toContain("429");
    expect(run.cells.every((cell) => !cell.scored.correct)).toBe(true);
  });

  it("renders a report that names every arm it ran", async () => {
    const run = await runBench({
      records,
      tasks,
      arms: ["A", "C"],
      models: ["mock"],
      transport: mockTransport(standingAwareAnswers),
      bootstrapIterations: 200,
    });
    const report = renderReport(run);
    expect(report).toContain("| mock | A |");
    expect(report).toContain("| mock | C |");
    expect(report).toContain("current-state");
  });
});

describe("answer parsing", () => {
  it("accepts the shape the forced tool is declared with", () => {
    expect(Object.keys(ANSWER_TOOL_SCHEMA.properties)).toEqual([
      "answer",
      "value",
      "actionable",
      "concept_ids",
    ]);
    expect(
      parseAnswer({
        answer: "a",
        value: "b",
        actionable: false,
        concept_ids: ["x", 3],
      }),
    ).toEqual({
      answer: "a",
      value: "b",
      actionable: false,
      conceptIds: ["x"],
    });
  });

  it("rejects anything missing a scored field", () => {
    expect(parseAnswer(null)).toBeNull();
    expect(parseAnswer({ answer: "a", value: "b" })).toBeNull();
    expect(
      parseAnswer({ answer: "a", value: "b", actionable: "yes" }),
    ).toBeNull();
  });
});

describe("bootstrap", () => {
  it("is reproducible from its seed", () => {
    const outcomes = [1, 0, 1, 1, 0, 1, 1, 1, 0, 1];
    expect(bootstrapCi(outcomes, { iterations: 500 })).toEqual(
      bootstrapCi(outcomes, { iterations: 500 }),
    );
  });

  it("brackets the observed mean", () => {
    const outcomes = Array.from({ length: 30 }, (_, index) =>
      index % 3 === 0 ? 1 : 0,
    );
    const ci = bootstrapCi(outcomes, { iterations: 2000 });
    expect(ci.mean).toBeCloseTo(10 / 30, 6);
    expect(ci.lower).toBeLessThanOrEqual(ci.mean);
    expect(ci.upper).toBeGreaterThanOrEqual(ci.mean);
    expect(ci.lower).toBeGreaterThanOrEqual(0);
    expect(ci.upper).toBeLessThanOrEqual(1);
  });

  it("collapses on a unanimous sample", () => {
    expect(bootstrapCi([1, 1, 1, 1], { iterations: 500 })).toEqual({
      mean: 1,
      lower: 1,
      upper: 1,
    });
  });

  it("draws in [0, 1) from a seeded generator", () => {
    const random = mulberry32(7);
    for (let index = 0; index < 100; index += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("cli", () => {
  it("defaults to the two-arm, one-model, four-question smoke run", () => {
    const options = parseArgs([]);
    expect(options.arms).toEqual(["A", "B"]);
    expect(options.models).toEqual(["claude-sonnet-5"]);
    expect(options.taskCount).toBe(4);
    expect(options.full).toBe(false);
  });

  it("--full opens the whole matrix", () => {
    const options = parseArgs(["--full"]);
    expect(options.arms).toEqual(["A", "B", "C", "D"]);
    expect(options.models).toEqual(["claude-sonnet-5", "claude-haiku-4-5"]);
    expect(options.taskCount).toBe(30);
  });

  it("takes explicit arms and models", () => {
    const options = parseArgs([
      "--arms=a,d",
      "--models=claude-haiku-4-5",
      "--tasks=8",
    ]);
    expect(options.arms).toEqual(["A", "D"]);
    expect(options.models).toEqual(["claude-haiku-4-5"]);
    expect(options.taskCount).toBe(8);
  });

  it("prices the full matrix before anything is spent", () => {
    const projection = estimate(parseArgs(["--full"]), 40_000);
    expect(projection.calls).toBe(30 * 4 * 2);
    expect(projection.inputTokensPerCall).toBe(10_000);
    for (const [, cost] of projection.costByModel) {
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(20);
    }
  });

  it("spreads a smoke sample across the question families", () => {
    const sampled = sampleTasks(4);
    expect(sampled).toHaveLength(4);
    expect(new Set(sampled.map((task) => task.type)).size).toBe(4);
  });
});
