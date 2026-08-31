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
});
