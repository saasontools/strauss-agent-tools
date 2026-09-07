import { bench, describe } from "vitest";
import { benchRecords, SAMPLING } from "./bench/fixtures.js";
import { recordSummary } from "./record-summary.js";

/**
 * Every read surface projects through this, so a whole-base read pays it once
 * per record. Ten thousand is well past where a base is loadable — the number
 * is here to show the projection is not what stops it.
 */
const records = benchRecords(10_000, 100);

describe("recordSummary", () => {
  bench(
    "10000 records",
    () => {
      for (const record of records) recordSummary(record);
    },
    SAMPLING,
  );
});
