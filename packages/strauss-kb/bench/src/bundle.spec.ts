import { describe, expect, it } from "vitest";
import { loadBundle } from "./bundle.js";
import { TASKS } from "./tasks.js";
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

  it("keeps supersession in the frontmatter and out of the prose", () => {
    // The whole experiment rests on this: if a body says "this replaces the
    // earlier decision", arms B and C still carry the signal in prose and the
    // comparison measures nothing.
    for (const record of records) {
      expect(
        /supersede|replaces the earlier|no longer (holds|applies)|previously decided/i.test(
          record.body,
        ),
        `${record.conceptId} leaks standing into its body`,
      ).toBe(false);
    }
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

describe("aggregation ground truth", () => {
  const ids = (predicate: (record: BenchRecord) => boolean): string[] =>
    records
      .filter(predicate)
      .map((record) => record.conceptId)
      .sort();

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

  it("matches the open test obligations the rubric expects", () => {
    expect(rubricFor("ag-open-test-obligations").conceptIdsEqual).toEqual(
      ids(
        (record) =>
          record.type === "test-obligation" && record.status === "open",
      ),
    );
  });

  it("matches the counted quantities the rubric expects", () => {
    expect(rubricFor("ag-open-question-count").numericValue).toBe(
      records.filter((r) => r.type === "open-question" && r.status === "open")
        .length,
    );
    expect(rubricFor("ag-risk-count").numericValue).toBe(
      records.filter((r) => r.type === "risk").length,
    );
    expect(rubricFor("ag-standing-decision-count").numericValue).toBe(
      records.filter((r) => r.type === "decision" && r.status !== "superseded")
        .length,
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

  it("covers thirty questions across the four families", () => {
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

  it("gives every task a unique id", () => {
    expect(new Set(TASKS.map((task) => task.id)).size).toBe(TASKS.length);
  });
});
