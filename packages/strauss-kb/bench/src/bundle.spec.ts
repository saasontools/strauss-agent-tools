import { describe, expect, it } from "vitest";
import { applyArm } from "./arms.js";
import { loadBundle } from "./bundle.js";
import { NARRATION_PATTERNS, SUPERSESSION_CHAINS } from "./chains.js";
import { CORE_TASKS, TASKS } from "./tasks.js";
import type { BenchRecord, Rubric } from "./model.js";

const records = await loadBundle();
const byId = new Map(records.map((record) => [record.conceptId, record]));
const rubricFor = (id: string): Rubric => {
  const task = TASKS.find((candidate) => candidate.id === id);
  if (!task) throw new Error(`no task ${id}`);
  return task.rubric;
};

describe("the arm-A fixture bundle", () => {
  it("is large enough to be worth measuring", () => {
    expect(records.length).toBeGreaterThanOrEqual(40);
  });

  it("links every supersession in both directions", () => {
    for (const record of records) {
      if (record.supersededBy) {
        const head = byId.get(record.supersededBy);
        expect(
          head,
          `${record.conceptId} points at a missing head`,
        ).toBeDefined();
        expect(head?.supersedes).toContain(record.conceptId);
        expect(record.status).toBe("superseded");
      }
      for (const target of record.supersedes) {
        const prior = byId.get(target);
        expect(
          prior,
          `${record.conceptId} supersedes a missing record`,
        ).toBeDefined();
        expect(prior?.supersededBy).toBe(record.conceptId);
      }
    }
  });

  it("resolves every answered stamp to a real record", () => {
    for (const record of records) {
      if (!record.answeredBy) continue;
      expect(byId.has(record.answeredBy)).toBe(true);
      expect(record.status).toBe("resolved");
    }
  });

  it("exercises all four question families", () => {
    const superseded = records.filter((r) => r.status === "superseded");
    const open = records.filter(
      (r) => r.type === "open-question" && r.status === "open",
    );
    const rejected = records.filter((r) => /## Rejected/.test(r.body));
    expect(superseded.length).toBeGreaterThanOrEqual(8);
    expect(open.length).toBeGreaterThanOrEqual(5);
    expect(rejected.length).toBeGreaterThanOrEqual(15);
  });
});

/**
 * The leak invariants.
 *
 * These are the tests the whole experiment leans on. If a body narrates its
 * own history, arms B and C keep the standing signal in prose, answer
 * correctly for a reason the benchmark is not measuring, and the A-B gap
 * closes for the wrong reason. A field-name regex cannot see that, so there
 * are three checks: the chain data must match the bundle, no body may carry a
 * narration phrase, and no replacement may name the thing it replaced.
 */
describe("standing never leaks into prose", () => {
  it("declares exactly the supersession pairs the bundle contains", () => {
    const inBundle = records
      .filter((record) => record.supersededBy)
      .map((record) => `${record.conceptId} -> ${record.supersededBy}`)
      .sort();
    const declared = SUPERSESSION_CHAINS.map(
      (pair) => `${pair.stale} -> ${pair.head}`,
    ).sort();
    expect(declared).toEqual(inBundle);
  });

  it("keeps every narration phrase out of every body", () => {
    for (const record of records) {
      for (const pattern of NARRATION_PATTERNS) {
        expect(
          pattern.test(record.body),
          `${record.conceptId} body matches ${pattern}`,
        ).toBe(false);
      }
    }
  });

  it("keeps the stale record's distinctive tokens out of its replacement", () => {
    for (const pair of SUPERSESSION_CHAINS) {
      const head = byId.get(pair.head);
      const stale = byId.get(pair.stale);
      expect(head, `missing head ${pair.head}`).toBeDefined();
      expect(stale, `missing stale ${pair.stale}`).toBeDefined();

      const body = head!.body.toLowerCase();
      for (const token of pair.staleTokens) {
        expect(
          body.includes(token),
          `${pair.head} names "${token}", which belongs to ${pair.stale}`,
        ).toBe(false);
      }
      // A denylist token that is not in the stale record either is a typo
      // dressed as a passing test.
      const staleBody = `${stale!.title} ${stale!.body}`.toLowerCase();
      for (const token of pair.staleTokens) {
        expect(
          staleBody.includes(token),
          `"${token}" is not in ${pair.stale}, so guarding against it proves nothing`,
        ).toBe(true);
      }
    }
  });

  it("renders arms B and C with no standing vocabulary at all", () => {
    for (const arm of ["B", "C"] as const) {
      for (const record of applyArm(records, arm).records) {
        expect(record.body).not.toBeNull();
        const text = [
          ...record.fields.map(([label, value]) => `${label}: ${value}`),
          record.body ?? "",
        ].join("\n");
        expect(text).not.toMatch(/superseded|strauss_status|no longer holds/i);
      }
    }
  });
});

describe("aggregation ground truth", () => {
  const ids = (predicate: (record: BenchRecord) => boolean): string[] =>
    records
      .filter(predicate)
      .map((record) => record.conceptId)
      .sort();
  const count = (predicate: (record: BenchRecord) => boolean): number =>
    records.filter(predicate).length;

  it("matches the superseded set the rubric expects", () => {
    expect(rubricFor("ag-superseded-ids").conceptIdsEqual).toEqual(
      ids((record) => record.status === "superseded"),
    );
  });

  it("matches the blocking set the rubric expects", () => {
    expect(rubricFor("ag-blocking-ids").conceptIdsEqual).toEqual(
      ids((record) => record.materiality === "blocking"),
    );
  });

  it("matches the counted quantities the rubric expects", () => {
    expect(rubricFor("ag-risk-count").numericValue).toBe(
      count((r) => r.type === "risk"),
    );
    expect(rubricFor("ag-decision-count").numericValue).toBe(
      count((r) => r.type === "decision"),
    );
    expect(rubricFor("ag-open-question-count").numericValue).toBe(
      count((r) => r.type === "open-question"),
    );
    expect(rubricFor("ag-standing-decision-count").numericValue).toBe(
      count((r) => r.type === "decision" && r.status !== "superseded"),
    );
  });
});

describe("per-question ground truth", () => {
  it("cites records that exist and still stand", () => {
    for (const task of TASKS) {
      for (const id of task.rubric.citeAll ?? []) {
        const record = byId.get(id);
        expect(record, `${task.id} cites missing ${id}`).toBeDefined();
        expect(record?.status, `${task.id} cites superseded ${id}`).not.toBe(
          "superseded",
        );
      }
    }
  });

  it("covers thirty questions across the four types", () => {
    expect(TASKS).toHaveLength(30);
    const counts = new Map<string, number>();
    for (const task of TASKS) {
      counts.set(task.type, (counts.get(task.type) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([
      "aggregation",
      "current-state",
      "open-question",
      "rejected-alternative",
    ]);
    for (const count of counts.values())
      expect(count).toBeGreaterThanOrEqual(7);
  });

  it("keeps every standing-only question inside the aggregation type", () => {
    // The split exists so the headline comparison is fair. If a current-state
    // or rejected-alternative question ever became standing-only, the headline
    // would quietly lose the family the experiment is about.
    for (const task of TASKS) {
      if (task.family === "standing-only")
        expect(task.type).toBe("aggregation");
    }
    expect(CORE_TASKS).toHaveLength(26);
    expect(TASKS.length - CORE_TASKS.length).toBe(4);
  });

  it("gives every task a unique id", () => {
    expect(new Set(TASKS.map((task) => task.id)).size).toBe(TASKS.length);
  });
});
