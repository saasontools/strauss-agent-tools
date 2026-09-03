import { describe, expect, test } from "vitest";
import { parseLog, renderLogEntry } from "./kb-log.js";

describe("parseLog", () => {
  test("sorts entries by `at`, independent of line order", () => {
    // A union merge of two worktrees' log.jsonl interleaves lines however
    // git's merge happened to visit them — not by when each was written. This
    // fixture is exactly that: worktree B's second write lands, in the file,
    // before worktree A's second write, even though A wrote first.
    const raw = [
      renderLogEntry({
        at: "2026-08-02T09:00:00.000Z",
        by: "agent:a",
        operation: "write",
        conceptId: "fact.one",
      }),
      renderLogEntry({
        at: "2026-08-02T09:00:01.000Z",
        by: "agent:b",
        operation: "write",
        conceptId: "fact.two",
      }),
      renderLogEntry({
        at: "2026-08-02T09:00:02.000Z",
        by: "agent:b",
        operation: "status:rejected",
        conceptId: "fact.two",
      }),
      renderLogEntry({
        at: "2026-08-02T09:00:03.000Z",
        by: "agent:a",
        operation: "status:accepted",
        conceptId: "fact.one",
      }),
    ].join("");

    const { entries, malformed } = parseLog(raw);

    expect(malformed).toEqual([]);
    expect(entries.map((entry) => `${entry.by}:${entry.operation}`)).toEqual([
      "agent:a:write",
      "agent:b:write",
      "agent:b:status:rejected",
      "agent:a:status:accepted",
    ]);
  });

  // Two entries sharing a timestamp (same millisecond, different writers)
  // must not be reordered by the sort — only a difference in `at` is a
  // reason to move an entry.
  test("keeps file order for entries that share a timestamp", () => {
    const raw = [
      renderLogEntry({
        at: "2026-08-02T09:00:00.000Z",
        by: "agent:b",
        operation: "write",
        conceptId: "fact.two",
      }),
      renderLogEntry({
        at: "2026-08-02T09:00:00.000Z",
        by: "agent:a",
        operation: "write",
        conceptId: "fact.one",
      }),
    ].join("");

    const { entries } = parseLog(raw);

    expect(entries.map((entry) => entry.conceptId)).toEqual([
      "fact.two",
      "fact.one",
    ]);
  });

  test("reports malformed lines by their original position, unaffected by the sort", () => {
    const raw = [
      renderLogEntry({
        at: "2026-08-02T09:00:05.000Z",
        by: "agent:a",
        operation: "write",
        conceptId: "fact.late",
      }),
      "not json\n",
      renderLogEntry({
        at: "2026-08-02T09:00:00.000Z",
        by: "agent:a",
        operation: "write",
        conceptId: "fact.early",
      }),
    ].join("");

    const { entries, malformed } = parseLog(raw);

    expect(malformed).toEqual([{ line: 2, text: "not json" }]);
    expect(entries.map((entry) => entry.conceptId)).toEqual([
      "fact.early",
      "fact.late",
    ]);
  });

  // `at` is a sort key, not just a display field. A value that parses as
  // JSON and matches every other field but isn't actually a timestamp — a
  // Unix epoch number stringified, a bare date, garbage — would sort
  // unpredictably rather than fail, so the schema rejects it outright and it
  // is reported the same way any other schema mismatch is.
  test("reports a well-formed entry whose `at` is not a real ISO-8601 timestamp", () => {
    const raw = [
      JSON.stringify({
        at: "not-a-timestamp",
        by: "agent:a",
        operation: "write",
        conceptId: "fact.one",
      }),
      // An offset other than `Z` is also rejected: `record()` always writes
      // `Date#toISOString()`, which is always `Z`, so a non-`Z` offset did
      // not come from this store and sorts unreliably against entries that
      // did.
      JSON.stringify({
        at: "2026-08-02T09:00:00+02:00",
        by: "agent:a",
        operation: "write",
        conceptId: "fact.two",
      }),
    ]
      .map((line) => `${line}\n`)
      .join("");

    const { entries, malformed } = parseLog(raw);

    expect(entries).toEqual([]);
    expect(malformed.map((m) => m.line)).toEqual([1, 2]);
  });

  // A union merge can carry the *same* commit's log line into both sides of
  // a merge (a cherry-pick or a rebase before the merge), producing two
  // byte-identical lines for what was genuinely one event. Since `record()`
  // mints its own `at` per call, two entries agreeing on every field
  // including `at` cannot be two independent writes — they're merge
  // residue, and the read path dedupes them rather than showing the same
  // event twice.
  test("dedupes exact-duplicate entries produced by a union merge", () => {
    const line = renderLogEntry({
      at: "2026-08-02T09:00:00.000Z",
      by: "agent:a",
      operation: "write",
      conceptId: "fact.one",
    });
    const raw = line + line;

    const { entries, malformed } = parseLog(raw);

    expect(malformed).toEqual([]);
    expect(entries).toHaveLength(1);
  });

  // Two *different* events that happen to share every field except `at` are
  // not a duplicate — both are genuine and both stay.
  test("keeps near-duplicate entries that differ only in `at`", () => {
    const raw = [
      renderLogEntry({
        at: "2026-08-02T09:00:00.000Z",
        by: "agent:a",
        operation: "write",
        conceptId: "fact.one",
      }),
      renderLogEntry({
        at: "2026-08-02T09:00:01.000Z",
        by: "agent:a",
        operation: "write",
        conceptId: "fact.one",
      }),
    ].join("");

    const { entries } = parseLog(raw);

    expect(entries).toHaveLength(2);
  });
});
