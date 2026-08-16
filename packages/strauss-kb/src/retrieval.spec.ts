import { describe, expect, test } from "vitest";
import { adjudicate } from "./adjudicate.js";
import { trace } from "./trace.js";
import type { KbRecord, KbRecordStatus } from "./kb-record.schema.js";

function record(
  conceptId: string,
  frontmatter: Partial<KbRecord["frontmatter"]> = {},
): KbRecord {
  const [type] = conceptId.split(".");
  return {
    conceptId,
    frontmatter: {
      type: type as string,
      strauss_status: "accepted" as KbRecordStatus,
      generated: { by: "test", at: "2026-08-01T00:00:00Z" },
      ...frontmatter,
    } as KbRecord["frontmatter"],
    body: frontmatter.title ? String(frontmatter.title) : "Body.",
  };
}

describe("adjudicate", () => {
  test("flags a rejected record — the answer to what we chose not to do", () => {
    const rejected = record("decision.offset-pagination", {
      strauss_status: "rejected",
    });

    const [hit] = adjudicate([rejected], [rejected]);

    expect(hit?.standing).toBe("rejected");
    expect(hit?.warnings).toContainEqual({ kind: "rejected" });
  });

  test("resolves a superseded record to its replacement and returns both", () => {
    const old = record("fact.auth-throws", {
      strauss_status: "superseded",
      strauss_superseded_by: "fact.auth-retries",
    });
    const current = record("fact.auth-retries", {
      strauss_supersedes: ["fact.auth-throws"],
    });

    const [hit] = adjudicate([old], [old, current]);

    expect(hit?.standing).toBe("superseded");
    expect(hit?.heads.map((h) => h.conceptId)).toEqual(["fact.auth-retries"]);
    expect(hit?.warnings).toContainEqual({
      kind: "superseded",
      by: ["fact.auth-retries"],
    });
  });

  test("follows a multi-hop chain to its end", () => {
    const a = record("fact.a", {
      strauss_status: "superseded",
      strauss_superseded_by: "fact.b",
    });
    const b = record("fact.b", {
      strauss_status: "superseded",
      strauss_superseded_by: "fact.c",
      strauss_supersedes: ["fact.a"],
    });
    const c = record("fact.c", { strauss_supersedes: ["fact.b"] });

    const [hit] = adjudicate([a], [a, b, c]);
    expect(hit?.heads.map((h) => h.conceptId)).toEqual(["fact.c"]);
  });

  // The failure worth the most care: it looks exactly like success.
  test("flags a chain pointing at a record that is not in the bundle", () => {
    const orphan = record("fact.a", {
      strauss_status: "superseded",
      strauss_superseded_by: "fact.gone",
    });

    const [hit] = adjudicate([orphan], [orphan]);

    expect(hit?.heads).toEqual([]);
    expect(hit?.warnings).toContainEqual({
      kind: "broken-chain",
      missing: "fact.gone",
    });
  });

  test("terminates on a chain a hand-edit made cyclic", () => {
    const a = record("fact.a", {
      strauss_status: "superseded",
      strauss_superseded_by: "fact.b",
    });
    const b = record("fact.b", {
      strauss_status: "superseded",
      strauss_superseded_by: "fact.a",
    });

    const [hit] = adjudicate([a], [a, b]);

    expect(
      hit?.warnings.some((warning) => warning.kind === "chain-cycle"),
    ).toBe(true);
  });

  // Picking one head silently would present a guess as a fact.
  test("reports every head when two records claim one ancestor", () => {
    const a = record("fact.a", { strauss_status: "superseded" });
    const b = record("fact.b", { strauss_supersedes: ["fact.a"] });
    const c = record("fact.c", { strauss_supersedes: ["fact.a"] });

    const [hit] = adjudicate([a], [a, b, c]);

    expect(hit?.heads.map((h) => h.conceptId).sort()).toEqual([
      "fact.b",
      "fact.c",
    ]);
    expect(hit?.warnings).toContainEqual({
      kind: "forked-chain",
      heads: ["fact.b", "fact.c"],
    });
  });

  // supersede() writes both sides, but a hand-edit can leave one behind — and
  // trusting only the forward pointer would return a record the bundle openly
  // says is replaced.
  test("resolves through the inverse pointer alone", () => {
    const old = record("fact.a", { strauss_status: "superseded" });
    const current = record("fact.b", { strauss_supersedes: ["fact.a"] });

    const [hit] = adjudicate([old], [old, current]);
    expect(hit?.heads.map((h) => h.conceptId)).toEqual(["fact.b"]);
  });

  test("flags an unsettled record and an unresolved question", () => {
    const proposed = record("decision.maybe", { strauss_status: "proposed" });
    const question = record("open-question.scope", { strauss_status: "open" });

    const hits = adjudicate([proposed, question], [proposed, question]);

    expect(hits[0]?.warnings).toContainEqual({
      kind: "unsettled",
      status: "proposed",
    });
    expect(hits[1]?.warnings).toContainEqual({ kind: "unresolved-question" });
  });

  test("flags a record past its staleness deadline", () => {
    const stale = record("fact.old", { stale_after: "2026-01-01" });

    const [hit] = adjudicate([stale], [stale], new Date("2026-08-01"));
    expect(hit?.warnings).toContainEqual({
      kind: "stale",
      staleAfter: "2026-01-01",
    });
  });
});

describe("trace", () => {
  const question = record("open-question.pagination", {
    strauss_status: "resolved",
    title: "How should listing paginate?",
    generated: { by: "test", at: "2026-08-01T09:00:00Z" },
    strauss_anchors: [{ file: "order.service.ts" }],
  });
  const rejected = record("decision.offset-pagination", {
    strauss_status: "rejected",
    title: "Offset pagination",
    generated: { by: "test", at: "2026-08-01T10:00:00Z" },
    strauss_anchors: [{ file: "order.service.ts", symbol: "listOrders" }],
  });
  const superseded = record("decision.cursor-v1", {
    strauss_status: "superseded",
    title: "Cursor pagination, opaque token",
    generated: { by: "test", at: "2026-08-01T11:00:00Z" },
    strauss_superseded_by: "decision.cursor-v2",
    strauss_anchors: [{ file: "order.service.ts", symbol: "listOrders" }],
  });
  const current = record("decision.cursor-v2", {
    title: "Cursor pagination, keyset",
    generated: { by: "test", at: "2026-08-01T12:00:00Z" },
    strauss_supersedes: ["decision.cursor-v1"],
    strauss_anchors: [{ file: "order.service.ts", symbol: "listOrders" }],
  });
  const bundle = [current, superseded, rejected, question];

  test("returns the arc in the order it happened", () => {
    const steps = trace("decision.cursor-v2", bundle);

    expect(steps.map((step) => step.record.conceptId)).toEqual([
      "open-question.pagination",
      "decision.offset-pagination",
      "decision.cursor-v1",
      "decision.cursor-v2",
    ]);
  });

  // The whole point of a trace: the rejected and superseded records are the
  // content, where a point query would flag them as hazards.
  test("includes the rejected alternative and the superseded version", () => {
    const statuses = trace("decision.cursor-v2", bundle).map(
      (step) => step.record.frontmatter.strauss_status,
    );

    expect(statuses).toContain("rejected");
    expect(statuses).toContain("superseded");
  });

  test("reaches a file-level record from a symbol-level seed", () => {
    const steps = trace("decision.cursor-v2", bundle, { edges: ["anchor"] });

    expect(steps.map((step) => step.record.conceptId)).toContain(
      "open-question.pagination",
    );
  });

  test("records every edge that reached a record, not just the first", () => {
    const step = trace("decision.cursor-v2", bundle).find(
      (candidate) => candidate.record.conceptId === "decision.cursor-v1",
    );

    expect(step?.via.sort()).toEqual(["anchor", "supersession"]);
  });

  test("honours the depth bound", () => {
    const steps = trace("decision.cursor-v2", bundle, {
      edges: ["supersession"],
      depth: 1,
    });

    expect(steps.map((step) => step.record.conceptId).sort()).toEqual([
      "decision.cursor-v1",
      "decision.cursor-v2",
    ]);
  });

  // The seed is where the reader already is; listing edges against it reads as
  // though something led there.
  test("leaves the seed with no inbound edge", () => {
    const seed = trace("decision.cursor-v2", bundle).find(
      (step) => step.record.conceptId === "decision.cursor-v2",
    );

    expect(seed?.depth).toBe(0);
    expect(seed?.via).toEqual([]);
  });

  test("returns nothing for a seed that is not in the bundle", () => {
    expect(trace("fact.absent", bundle)).toEqual([]);
  });
});
