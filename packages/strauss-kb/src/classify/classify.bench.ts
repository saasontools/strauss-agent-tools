import { bench, describe } from "vitest";
import { benchDiff, benchOverrides, SAMPLING } from "../bench/fixtures.js";
import { classifyDiff } from "./classify.js";

/**
 * A 5,000-file diff — a lockfile bump or a generated-client refresh, the
 * shapes `classify` exists to keep a reviewer out of. One hunk each, since the
 * per-file rules are what scale here, not the per-hunk ones.
 */
const FILES = 5_000;
const files = benchDiff(FILES, FILES, { withLines: true });
const records = benchOverrides(200, FILES);

describe("classifyDiff", () => {
  bench(
    `${FILES} files, no records`,
    () => {
      classifyDiff(files);
    },
    SAMPLING,
  );

  // With overrides in play every file is probed against every `review:*` fact
  // before the heuristic runs, which is the more expensive of the two paths.
  bench(
    `${FILES} files, 200 records`,
    () => {
      classifyDiff(files, { records });
    },
    SAMPLING,
  );
});
