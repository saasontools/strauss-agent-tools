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
    const blocking = rubric("ag-blocking-ids");
    const expected = blocking.conceptIdsEqual ?? [];
    expect(
      scoreAnswer(
        answer({ value: "4", conceptIds: [...expected].reverse() }),
        blocking,
      ).correct,
    ).toBe(true);
    expect(
      scoreAnswer(
        answer({ value: "5", conceptIds: [...expected, "risk.x"] }),
        blocking,
      ).correct,
    ).toBe(false);
    expect(
      scoreAnswer(
        answer({ value: "3", conceptIds: expected.slice(1) }),
        blocking,
      ).correct,
    ).toBe(false);
  });

  it("accepts a count however the model spells it", () => {
    for (const value of ["6", "six", "6 open questions", "There are 6"]) {
      expect(
        scoreAnswer(answer({ value }), rubric("ag-open-question-count"))
          .correct,
      ).toBe(true);
    }
    expect(
      scoreAnswer(answer({ value: "5" }), rubric("ag-open-question-count"))
        .correct,
    ).toBe(false);
    // The ground truth reaches past twelve, where the first word table stopped.
    for (const value of ["16", "sixteen", "Sixteen decisions"]) {
      expect(
        scoreAnswer(answer({ value }), rubric("ag-standing-decision-count"))
          .correct,
      ).toBe(true);
    }
    for (const value of ["24", "twenty-four", "twenty four"]) {
      expect(
        scoreAnswer(answer({ value }), rubric("ag-decision-count")).correct,
      ).toBe(true);
    }
  });
});

describe("parseCount", () => {
  it("reads digits, number words, and nothing at all", () => {
    expect(parseCount("16 decisions")).toBe(16);
    expect(parseCount("four")).toBe(4);
    expect(parseCount("Four risks")).toBe(4);
    expect(parseCount("sixteen")).toBe(16);
    expect(parseCount("nineteen records")).toBe(19);
    expect(parseCount("twenty")).toBe(20);
    expect(parseCount("twenty-four")).toBe(24);
    expect(parseCount("Thirty one")).toBe(31);
    expect(parseCount("plenty")).toBeNull();
    expect(parseCount("")).toBeNull();
  });
});
