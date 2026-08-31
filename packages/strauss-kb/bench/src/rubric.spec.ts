import { describe, expect, it } from "vitest";
import { parseCount, scoreAnswer } from "./rubric.js";
import { TASKS } from "./tasks.js";
import type { ModelAnswer } from "./model.js";

const answer = (over: Partial<ModelAnswer> = {}): ModelAnswer => ({
  answer: "",
  value: "",
  actionable: true,
  conceptIds: [],
  ...over,
});

const rubric = (id: string) => {
  const task = TASKS.find((candidate) => candidate.id === id);
  if (!task) throw new Error(`no task ${id}`);
  return task.rubric;
};

describe("scoreAnswer", () => {
  it("marks a missing answer wrong rather than throwing", () => {
    expect(scoreAnswer(null, rubric("cs-queue-backend")).correct).toBe(false);
  });

  it("passes the current answer that cites the standing record", () => {
    const scored = scoreAnswer(
      answer({
        value: "NATS JetStream",
        conceptIds: ["decision.jetstream-queue-backend"],
      }),
      rubric("cs-queue-backend"),
    );
    expect(scored.correct).toBe(true);
  });

  it("fails the stale answer even when it cites the right record", () => {
    const scored = scoreAnswer(
      answer({
        value: "Amazon SQS",
        conceptIds: ["decision.jetstream-queue-backend"],
      }),
      rubric("cs-queue-backend"),
    );
    expect(scored.correct).toBe(false);
    expect(scored.checks["valueIncludes[0]"]).toBe(false);
    expect(scored.checks["valueExcludes[0]"]).toBe(false);
  });

  it("fails a right answer that rests on nothing", () => {
    const scored = scoreAnswer(
      answer({ value: "NATS JetStream" }),
      rubric("cs-queue-backend"),
    );
    expect(scored.correct).toBe(false);
    expect(scored.checks.citeAll).toBe(false);
  });

  it("rewards refusing an open question", () => {
    const refusal = answer({
      actionable: false,
      value: "",
      conceptIds: ["open-question.eu-data-residency"],
    });
    expect(scoreAnswer(refusal, rubric("oq-eu-residency")).correct).toBe(true);
  });

  it("punishes answering an open question confidently", () => {
    const overconfident = answer({
      actionable: true,
      value: "Yes, EU data stays in the EU",
      conceptIds: ["open-question.eu-data-residency"],
    });
    expect(scoreAnswer(overconfident, rubric("oq-eu-residency")).correct).toBe(
      false,
    );
  });

  it("punishes refusing a settled question, so blanket refusal cannot win", () => {
    const refusal = answer({
      actionable: false,
      value: "400 days",
      conceptIds: ["decision.audit-log-retention"],
    });
    expect(
      scoreAnswer(refusal, rubric("oq-audit-retention-settled")).correct,
    ).toBe(false);
  });

  it("does not demand a value from a correct refusal", () => {
    const scored = scoreAnswer(
      answer({ actionable: false, conceptIds: ["open-question.byo-smtp"] }),
      rubric("oq-byo-smtp"),
    );
    expect(scored.checks).not.toHaveProperty("valueIncludes[0]");
  });

  it("compares an id list as a set, not a sequence", () => {
    const expected = rubric("ag-open-test-obligations").conceptIdsEqual ?? [];
    expect(
      scoreAnswer(answer({ value: "2", conceptIds: [...expected].reverse() }), {
        ...rubric("ag-open-test-obligations"),
      }).correct,
    ).toBe(true);
    expect(
      scoreAnswer(answer({ value: "3", conceptIds: [...expected, "risk.x"] }), {
        ...rubric("ag-open-test-obligations"),
      }).correct,
    ).toBe(false);
  });

  it("accepts a count however the model spells it", () => {
    for (const value of ["5", "five", "5 open questions", "There are 5"]) {
      expect(
        scoreAnswer(answer({ value }), rubric("ag-open-question-count"))
          .correct,
      ).toBe(true);
    }
    expect(
      scoreAnswer(answer({ value: "6" }), rubric("ag-open-question-count"))
        .correct,
    ).toBe(false);
  });
});

describe("parseCount", () => {
  it("reads digits, number words, and nothing at all", () => {
    expect(parseCount("16 decisions")).toBe(16);
    expect(parseCount("four")).toBe(4);
    expect(parseCount("Four risks")).toBe(4);
    expect(parseCount("plenty")).toBeNull();
    expect(parseCount("")).toBeNull();
  });
});
