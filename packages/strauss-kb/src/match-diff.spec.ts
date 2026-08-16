import { describe, expect, test } from "vitest";
import { matchToDiff, type SymbolRange } from "./match-diff.js";
import type { KbRecord } from "./kb-record.schema.js";

function record(
  conceptId: string,
  anchors: { file: string; symbol?: string }[],
  frontmatter: Partial<KbRecord["frontmatter"]> = {},
): KbRecord {
  const [type] = conceptId.split(".");
  return {
    conceptId,
    frontmatter: {
      type: type as string,
      strauss_status: "accepted",
      generated: { by: "test", at: "2026-08-01T00:00:00Z" },
      strauss_anchors: anchors,
      ...frontmatter,
    } as KbRecord["frontmatter"],
    body: "Body.",
  };
}

const SERVICE = "src/services/order.service.ts";
const listOrders: SymbolRange = {
  file: SERVICE,
  symbol: "listOrders",
  startLine: 100,
  endLine: 140,
};

describe("matchToDiff", () => {
  test("a file-level anchor lands on every hunk in that file", () => {
    const matches = matchToDiff(
      [
        {
          filePath: SERVICE,
          hunks: [
            { startLine: 10, endLine: 20 },
            { startLine: 200, endLine: 210 },
          ],
        },
      ],
      [record("decision.whole-file", [{ file: SERVICE }])],
    );

    expect(matches).toHaveLength(2);
    expect(matches.every((match) => match.precision === "file")).toBe(true);
  });

  test("a symbol anchor lands only where its lines overlap", () => {
    const matches = matchToDiff(
      [
        {
          filePath: SERVICE,
          hunks: [
            { startLine: 10, endLine: 20 },
            { startLine: 120, endLine: 130 },
          ],
        },
      ],
      [record("decision.cursor", [{ file: SERVICE, symbol: "listOrders" }])],
      { symbolRanges: [listOrders] },
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.hunk.startLine).toBe(120);
    expect(matches[0]?.precision).toBe("symbol");
  });

  test("touching at a boundary counts as overlap", () => {
    const matches = matchToDiff(
      [{ filePath: SERVICE, hunks: [{ startLine: 140, endLine: 150 }] }],
      [record("decision.cursor", [{ file: SERVICE, symbol: "listOrders" }])],
      { symbolRanges: [listOrders] },
    );

    expect(matches).toHaveLength(1);
  });

  // A record absent because a resolver was unavailable is worse than one shown
  // imprecisely and labelled as such.
  test("an unresolvable symbol degrades to the file rather than vanishing", () => {
    const matches = matchToDiff(
      [{ filePath: SERVICE, hunks: [{ startLine: 10, endLine: 20 }] }],
      [record("decision.cursor", [{ file: SERVICE, symbol: "listOrders" }])],
      { symbolRanges: [] },
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.precision).toBe("file");
  });

  // Claiming symbol precision for a hunk carrying a file-level match would
  // assert a pinpoint the match does not have.
  test("one file-level match makes the whole hunk file-precision", () => {
    const matches = matchToDiff(
      [{ filePath: SERVICE, hunks: [{ startLine: 120, endLine: 130 }] }],
      [
        record("decision.cursor", [{ file: SERVICE, symbol: "listOrders" }]),
        record("constraint.whole-file", [{ file: SERVICE }]),
      ],
      { symbolRanges: [listOrders] },
    );

    expect(matches[0]?.records).toHaveLength(2);
    expect(matches[0]?.precision).toBe("file");
  });

  test("a hunk with nothing anchored to it produces no entry at all", () => {
    const matches = matchToDiff(
      [
        {
          filePath: "src/other.ts",
          hunks: [{ startLine: 1, endLine: 5 }],
        },
      ],
      [record("decision.cursor", [{ file: SERVICE }])],
    );

    expect(matches).toEqual([]);
  });

  test("a record with no anchors matches nothing", () => {
    const matches = matchToDiff(
      [{ filePath: SERVICE, hunks: [{ startLine: 1, endLine: 5 }] }],
      [record("decision.floating", [])],
    );

    expect(matches).toEqual([]);
  });

  test("superseded records are carried, adjudicated, not dropped", () => {
    const old = record("decision.cursor-v1", [{ file: SERVICE }], {
      strauss_status: "superseded",
      strauss_superseded_by: "decision.cursor-v2",
    });
    const current = record("decision.cursor-v2", [{ file: SERVICE }], {
      strauss_supersedes: ["decision.cursor-v1"],
    });

    const [match] = matchToDiff(
      [{ filePath: SERVICE, hunks: [{ startLine: 1, endLine: 5 }] }],
      [old, current],
    );

    expect(match?.records).toHaveLength(2);
    const superseded = match?.records.find(
      (hit) => hit.record.conceptId === "decision.cursor-v1",
    );
    expect(superseded?.standing).toBe("superseded");
    expect(superseded?.heads.map((head) => head.conceptId)).toEqual([
      "decision.cursor-v2",
    ]);
  });

  // What still holds should be read before what does not.
  test("orders current before superseded before rejected", () => {
    const [match] = matchToDiff(
      [{ filePath: SERVICE, hunks: [{ startLine: 1, endLine: 5 }] }],
      [
        record("decision.no", [{ file: SERVICE }], {
          strauss_status: "rejected",
        }),
        record("decision.old", [{ file: SERVICE }], {
          strauss_status: "superseded",
        }),
        record("decision.now", [{ file: SERVICE }]),
      ],
    );

    expect(match?.records.map((hit) => hit.record.conceptId)).toEqual([
      "decision.now",
      "decision.old",
      "decision.no",
    ]);
  });

  test("tolerates a ./-prefixed anchor path", () => {
    const matches = matchToDiff(
      [{ filePath: SERVICE, hunks: [{ startLine: 1, endLine: 5 }] }],
      [record("decision.cursor", [{ file: `./${SERVICE}` }])],
    );

    expect(matches).toHaveLength(1);
  });

  test("matches across several files independently", () => {
    const other = "src/controllers/order.controller.ts";
    const matches = matchToDiff(
      [
        { filePath: SERVICE, hunks: [{ startLine: 1, endLine: 5 }] },
        { filePath: other, hunks: [{ startLine: 1, endLine: 5 }] },
      ],
      [
        record("decision.a", [{ file: SERVICE }]),
        record("decision.b", [{ file: other }]),
      ],
    );

    expect(matches.map((match) => match.records[0]?.record.conceptId)).toEqual([
      "decision.a",
      "decision.b",
    ]);
  });
});
