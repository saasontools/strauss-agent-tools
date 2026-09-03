import { describe, expect, it } from "vitest";
import { loadBundle } from "./bundle.js";
import { ANSWER_TOOL_SCHEMA, SYSTEM_PROMPT, parseAnswer } from "./prompt.js";
import { CliUsageError, estimate, main, parseArgs } from "./cli.js";
import { projectCost, usageCost } from "./models.js";
import { renderReport } from "./report.js";
import { pairedDifferences, runBench } from "./runner.js";
import { CORE_TASKS, TASKS, sampleTasks } from "./tasks.js";
import {
  EMPTY_USAGE,
  isRetryable,
  mockTransport,
  retryAfterMs,
  withRetry,
} from "./transport.js";
import { bootstrapCi, bootstrapPairedDiff, mulberry32 } from "./stats.js";
import type { BenchRequest } from "./transport.js";

const records = await loadBundle();
const tasks = CORE_TASKS.slice(0, 4);

/**
 * A stand-in that answers correctly only when the prompt still carries the
 * supersession link.
 */
const standingAwareAnswers = (request: BenchRequest) => {
  const sawStanding = request.bundle.includes("superseded_by:");
  if (request.question.includes("insurance-claim submission")) {
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
    expect(new Date(run.finishedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(run.startedAt).getTime(),
    );
  });

  it("stamps startedAt before the calls, not after them", async () => {
    const before = Date.now();
    const run = await runBench({
      records,
      tasks: [CORE_TASKS[0]!],
      arms: ["A"],
      models: ["mock"],
      transport: async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { answer: null, usage: EMPTY_USAGE };
      },
      bootstrapIterations: 100,
    });
    const started = new Date(run.startedAt).getTime();
    expect(started).toBeGreaterThanOrEqual(before);
    expect(started).toBeLessThan(new Date(run.finishedAt).getTime());
  });

  it("separates the arms on the question the arms are about", async () => {
    const run = await runBench({
      records,
      tasks: [CORE_TASKS[0]!],
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

  it("sends the same system prompt and the same question in every arm", async () => {
    const transport = mockTransport(standingAwareAnswers);
    await runBench({
      records,
      tasks: [CORE_TASKS[0]!],
      arms: ["A", "B", "C", "D"],
      models: ["mock"],
      transport,
      bootstrapIterations: 200,
    });
    for (const request of transport.requests) {
      expect(request.system).toBe(SYSTEM_PROMPT);
      expect(request.question).toContain(CORE_TASKS[0]!.question);
      // The cacheable half must hold the notes and nothing that varies.
      expect(request.bundle).toContain("# Project notes");
      expect(request.bundle).not.toContain(CORE_TASKS[0]!.question);
    }
    // Same arm, same prefix -- otherwise the cache never hits.
    const armA = transport.requests.filter((request) =>
      request.bundle.includes("superseded_by:"),
    );
    expect(new Set(armA.map((request) => request.bundle)).size).toBe(1);
  });

  it("marks a transport failure errored and drops it from the denominator", async () => {
    let calls = 0;
    const run = await runBench({
      records,
      tasks,
      arms: ["A"],
      models: ["mock"],
      transport: async () => {
        calls += 1;
        if (calls === 2) throw new Error("429 rate limited");
        return {
          answer: {
            answer: "",
            value: "NATS JetStream",
            actionable: true,
            conceptIds: ["decision.jetstream-queue-backend"],
          },
          usage: EMPTY_USAGE,
        };
      },
      concurrency: 1,
      bootstrapIterations: 200,
    });

    expect(run.cells).toHaveLength(4);
    expect(run.totals.errored).toBe(1);
    expect(run.cells[1]?.errored).toBe(true);
    expect(run.cells[1]?.error).toContain("429");

    const summary = run.summaries[0]!;
    expect(summary.n).toBe(3);
    expect(summary.errored).toBe(1);
    // One correct answer out of the three that came back -- not one out of four.
    expect(summary.accuracy.mean).toBeCloseTo(1 / 3, 6);
  });

  it("still scores an answerless response as wrong", async () => {
    // A refused or truncated tool call is a real failure to answer. Only a
    // thrown transport error is infrastructure.
    const run = await runBench({
      records,
      tasks: [CORE_TASKS[0]!],
      arms: ["A"],
      models: ["mock"],
      transport: async () => ({ answer: null, usage: EMPTY_USAGE }),
      bootstrapIterations: 100,
    });
    expect(run.cells[0]?.errored).toBe(false);
    expect(run.cells[0]?.scored.correct).toBe(false);
    expect(run.summaries[0]?.n).toBe(1);
  });

  it("renders a report that names every arm and the paired differences", async () => {
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
    expect(report).toContain("A - C");
    expect(report).toContain("current-state");
    expect(report).toContain("cache read");
  });
});

describe("paired differences", () => {
  it("pairs on the question and reports core separately from all", async () => {
    const run = await runBench({
      records,
      tasks: TASKS,
      arms: ["A", "B"],
      models: ["mock"],
      transport: mockTransport(standingAwareAnswers),
      bootstrapIterations: 200,
    });

    const families = run.differences.map((diff) => diff.family);
    expect(new Set(families)).toEqual(
      new Set(["all", "core", "standing-only"]),
    );

    const core = run.differences.find((diff) => diff.family === "core");
    const all = run.differences.find((diff) => diff.family === "all");
    expect(core?.pairs).toBe(CORE_TASKS.length);
    expect(all?.pairs).toBe(TASKS.length);
    expect(core?.baseline).toBe("A");
    expect(core?.comparison).toBe("B");
  });

  it("drops a question from the pairing when either arm errored", () => {
    const cell = (
      arm: "A" | "B",
      taskId: string,
      correct: boolean,
      errored = false,
    ) => ({
      arm,
      model: "mock",
      taskId,
      taskType: "current-state" as const,
      taskFamily: "core" as const,
      answer: null,
      scored: { correct, checks: {} },
      usage: EMPTY_USAGE,
      maxTokens: 2000,
      errored,
      error: errored ? "boom" : null,
    });

    const differences = pairedDifferences(
      [
        cell("A", "q1", true),
        cell("B", "q1", false),
        cell("A", "q2", true),
        cell("B", "q2", false, true),
      ],
      200,
    );
    const all = differences.find((diff) => diff.family === "all");
    expect(all?.pairs).toBe(1);
    expect(all?.difference.mean).toBe(1);
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

describe("retry", () => {
  const rateLimited = Object.assign(new Error("rate limited"), { status: 429 });

  it("classifies what is worth another attempt", () => {
    expect(isRetryable(rateLimited)).toBe(true);
    expect(isRetryable(Object.assign(new Error("boom"), { status: 503 }))).toBe(
      true,
    );
    expect(isRetryable(Object.assign(new Error("bad"), { status: 400 }))).toBe(
      false,
    );
    expect(isRetryable(Object.assign(new Error("nope"), { status: 404 }))).toBe(
      false,
    );
  });

  it("retries connection failures but not status-less programming errors", () => {
    // A plain error with no status and no connection code is a bug, not a
    // fault worth burning attempts on.
    expect(
      isRetryable(new TypeError("cannot read properties of undefined")),
    ).toBe(false);
    expect(isRetryable(new Error("socket hang up"))).toBe(false);

    expect(
      isRetryable(Object.assign(new Error("reset"), { code: "ECONNRESET" })),
    ).toBe(true);
    expect(
      isRetryable(
        Object.assign(new Error("refused"), { code: "ECONNREFUSED" }),
      ),
    ).toBe(true);
    expect(
      isRetryable(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })),
    ).toBe(true);
    expect(
      isRetryable(
        Object.assign(new Error("no api"), { name: "APIConnectionError" }),
      ),
    ).toBe(true);
    expect(
      isRetryable(
        Object.assign(new Error("slow"), { name: "APIConnectionTimeoutError" }),
      ),
    ).toBe(true);
    expect(
      isRetryable(
        Object.assign(new Error("custom"), { name: "WeirdConnectionError" }),
      ),
    ).toBe(true);
  });

  it("reads retry-after from either header shape", () => {
    expect(retryAfterMs({ headers: { "retry-after": "2.5" } })).toBe(2500);
    expect(retryAfterMs({ headers: new Headers({ "retry-after": "3" }) })).toBe(
      3000,
    );
    expect(retryAfterMs({ headers: {} })).toBeNull();
    expect(retryAfterMs(new Error("no headers"))).toBeNull();
  });

  it("retries a 429 and returns the eventual success", async () => {
    let calls = 0;
    const slept: number[] = [];
    const transport = withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw rateLimited;
        return { answer: null, usage: EMPTY_USAGE };
      },
      {
        sleep: async (ms) => {
          slept.push(ms);
        },
        random: () => 1,
      },
    );

    await transport({
      model: "m",
      system: "",
      bundle: "",
      question: "",
      maxTokens: 1,
    });
    expect(calls).toBe(3);
    // Exponential: one second, then two.
    expect(slept).toEqual([1000, 2000]);
  });

  it("honours retry-after over its own backoff", async () => {
    const slept: number[] = [];
    let calls = 0;
    const transport = withRetry(
      async () => {
        calls += 1;
        if (calls === 1) {
          throw Object.assign(new Error("slow down"), {
            status: 429,
            headers: { "retry-after": "7" },
          });
        }
        return { answer: null, usage: EMPTY_USAGE };
      },
      {
        sleep: async (ms) => {
          slept.push(ms);
        },
      },
    );
    await transport({
      model: "m",
      system: "",
      bundle: "",
      question: "",
      maxTokens: 1,
    });
    expect(slept).toEqual([7000]);
  });

  it("gives up after the budget and does not retry a 400", async () => {
    let calls = 0;
    const exhausting = withRetry(
      async () => {
        calls += 1;
        throw rateLimited;
      },
      { attempts: 3, sleep: async () => {}, random: () => 0 },
    );
    await expect(
      exhausting({
        model: "m",
        system: "",
        bundle: "",
        question: "",
        maxTokens: 1,
      }),
    ).rejects.toThrow("rate limited");
    expect(calls).toBe(3);

    let badCalls = 0;
    const fatal = withRetry(
      async () => {
        badCalls += 1;
        throw Object.assign(new Error("schema"), { status: 400 });
      },
      { sleep: async () => {} },
    );
    await expect(
      fatal({ model: "m", system: "", bundle: "", question: "", maxTokens: 1 }),
    ).rejects.toThrow("schema");
    expect(badCalls).toBe(1);
  });

  it("throws a status-less programming error after a single attempt", async () => {
    let calls = 0;
    const buggy = withRetry(
      async () => {
        calls += 1;
        throw new TypeError("cannot read properties of undefined");
      },
      { sleep: async () => {} },
    );
    await expect(
      buggy({ model: "m", system: "", bundle: "", question: "", maxTokens: 1 }),
    ).rejects.toThrow(TypeError);
    expect(calls).toBe(1);
  });

  it("retries a named connection error and gives up on a 400", async () => {
    let connCalls = 0;
    const connection = withRetry(
      async () => {
        connCalls += 1;
        if (connCalls < 2) {
          throw Object.assign(new Error("no connection"), {
            name: "APIConnectionError",
          });
        }
        return { answer: null, usage: EMPTY_USAGE };
      },
      { sleep: async () => {}, random: () => 0 },
    );
    await connection({
      model: "m",
      system: "",
      bundle: "",
      question: "",
      maxTokens: 1,
    });
    expect(connCalls).toBe(2);

    let rateCalls = 0;
    const rate = withRetry(
      async () => {
        rateCalls += 1;
        if (rateCalls < 2) throw rateLimited;
        return { answer: null, usage: EMPTY_USAGE };
      },
      { sleep: async () => {}, random: () => 0 },
    );
    await rate({
      model: "m",
      system: "",
      bundle: "",
      question: "",
      maxTokens: 1,
    });
    expect(rateCalls).toBe(2);

    let badCalls2 = 0;
    const bad = withRetry(
      async () => {
        badCalls2 += 1;
        throw Object.assign(new Error("bad request"), { status: 400 });
      },
      { sleep: async () => {} },
    );
    await expect(
      bad({ model: "m", system: "", bundle: "", question: "", maxTokens: 1 }),
    ).rejects.toThrow("bad request");
    expect(badCalls2).toBe(1);
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

describe("paired bootstrap", () => {
  it("returns the observed difference and refuses ragged samples", () => {
    const a = [1, 1, 1, 0, 1, 1, 0, 1];
    const b = [0, 1, 0, 0, 1, 0, 0, 1];
    const ci = bootstrapPairedDiff(a, b, { iterations: 2000 });
    expect(ci.mean).toBeCloseTo(3 / 8, 6);
    expect(ci.lower).toBeLessThanOrEqual(ci.mean);
    expect(ci.upper).toBeGreaterThanOrEqual(ci.mean);
    expect(() => bootstrapPairedDiff([1, 0], [1])).toThrow(/aligned/);
  });

  it("excludes zero where the per-arm intervals overlap", () => {
    // Twenty questions, ten of them hard in both arms. Arm A wins six of the
    // ten easy ones outright and never loses. Per-arm intervals overlap
    // heavily; the paired difference does not touch zero.
    const a = [...Array.from({ length: 10 }, () => 0), ...Array(10).fill(1)];
    const b = [
      ...Array.from({ length: 10 }, () => 0),
      ...[0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
    ];
    const armA = bootstrapCi(a, { iterations: 4000 });
    const armB = bootstrapCi(b, { iterations: 4000 });
    expect(armA.lower).toBeLessThan(armB.upper); // the intervals overlap

    const diff = bootstrapPairedDiff(a, b, { iterations: 4000 });
    expect(diff.mean).toBeCloseTo(6 / 20, 6);
    expect(diff.lower).toBeGreaterThan(0);
  });

  it("is zero, tightly, when the arms agree everywhere", () => {
    const outcomes = [1, 0, 1, 1, 0, 1];
    expect(
      bootstrapPairedDiff(outcomes, outcomes, { iterations: 500 }),
    ).toEqual({
      mean: 0,
      lower: 0,
      upper: 0,
    });
  });
});

describe("cost", () => {
  it("prices each token class at its own rate", () => {
    // 1M uncached input on Sonnet 5 is $2; a cache write is 1.25x and a read
    // 0.1x of that, and output is $10/MTok.
    const cost = usageCost("claude-sonnet-5", {
      inputTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(2 + 2.5 + 0.2 + 10, 6);
  });

  it("makes caching cheaper than not caching, and says when it cannot cache", () => {
    const shape = {
      prefixTokens: 9000,
      tailTokens: 200,
      outputTokens: 220,
      callsPerPrefix: 30,
      prefixes: 4,
    };
    const sonnet = projectCost("claude-sonnet-5", shape);
    expect(sonnet.calls).toBe(120);
    expect(sonnet.prefixCaches).toBe(true);
    expect(sonnet.cached).toBeLessThan(sonnet.uncached);

    // Under Haiku 4.5's 4096-token minimum the marker is ignored, so the two
    // columns have to agree rather than quietly promising a saving.
    const tiny = projectCost("claude-haiku-4-5", {
      ...shape,
      prefixTokens: 900,
    });
    expect(tiny.prefixCaches).toBe(false);
    expect(tiny.cached).toBeCloseTo(tiny.uncached, 9);
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

  it("takes explicit arms and models, and ignores a bare --", () => {
    const options = parseArgs([
      "--",
      "--arms=a,d",
      "--models=claude-haiku-4-5",
      "--tasks=8",
    ]);
    expect(options.arms).toEqual(["A", "D"]);
    expect(options.models).toEqual(["claude-haiku-4-5"]);
    expect(options.taskCount).toBe(8);
  });

  it("refuses a typo rather than spending the budget on it", () => {
    expect(() => parseArgs(["--arms=A,E"])).toThrow(/unknown arm "E"/);
    expect(() => parseArgs(["--arms=A,A"])).toThrow(/same arm twice/);
    expect(() => parseArgs(["--models=claude-sonet-5"])).toThrow(
      /unknown model/,
    );
    expect(() => parseArgs(["--fill"])).toThrow(/unknown flag --fill/);
    expect(() => parseArgs(["--tasks=0"])).toThrow(
      /--tasks must be an integer/,
    );
    expect(() => parseArgs(["--tasks=99"])).toThrow(
      /--tasks must be an integer/,
    );
    expect(() => parseArgs(["--concurrency=nope"])).toThrow(/--concurrency/);
    expect(() => parseArgs(["full"])).toThrow(/unexpected argument/);
    expect(() => parseArgs(["--arms=A,E"])).toThrow(CliUsageError);
  });

  it("prices the full matrix before anything is spent", () => {
    const projection = estimate(parseArgs(["--full"]), TASKS, 36_000, 800);
    expect(projection.calls).toBe(30 * 4 * 2);
    expect(projection.prefixTokens).toBe(9000);
    expect(projection.tailTokens).toBe(200);
    for (const [, cost] of projection.byModel) {
      expect(cost.cached).toBeGreaterThan(0);
      expect(cost.cached).toBeLessThan(cost.uncached);
      expect(cost.uncached).toBeLessThan(20);
    }
  });

  it("--help lists every flag it accepts, and calls nothing", async () => {
    const lines: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      lines.push(chunk);
      return true;
    }) as typeof process.stdout.write;
    let code: number;
    try {
      code = await main(["--help"]);
    } finally {
      process.stdout.write = write;
    }
    const printed = lines.join("");
    expect(code).toBe(0);
    for (const flag of [
      "--full",
      "--estimate",
      "--arms",
      "--models",
      "--tasks",
      "--concurrency",
      "--out",
      "--help",
    ]) {
      expect(printed).toContain(flag);
    }
  });

  it("spreads a smoke sample across the question families", () => {
    const sampled = sampleTasks(4);
    expect(sampled).toHaveLength(4);
    expect(new Set(sampled.map((task) => task.type)).size).toBe(4);
    // A smoke run must not spend its four questions on ground truth arms B
    // and C never received.
    expect(sampled.every((task) => task.family === "core")).toBe(true);
  });
});
