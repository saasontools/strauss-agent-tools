import { bench, describe } from "vitest";
import { benchDiff, benchRecords, SAMPLING } from "./bench/fixtures.js";
import { matchToDiff } from "./match-diff.js";

/**
 * `matchToDiff` is the hot library call: a gate runs it on every hunk of every
 * push, and it is pure, so this is the cost with no I/O in it.
 */
const RECORDS = [100, 1_000, 10_000];
const HUNKS = [10, 100, 1_000];

describe("matchToDiff", () => {
  for (const records of RECORDS) {
    for (const hunks of HUNKS) {
      // Hunks cluster ten to a file, and records spread over the same paths,
      // so a bigger base widens the candidate list rather than the file list.
      const files = Math.max(1, Math.ceil(hunks / 10));
      const base = benchRecords(records, files);
      const diff = benchDiff(hunks, files);
      bench(
        `${records} records x ${hunks} hunks`,
        () => {
          matchToDiff(diff, base);
        },
        SAMPLING,
      );
    }
  }
});
