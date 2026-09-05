import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  benchDiff,
  benchLog,
  benchOverrides,
  benchRecords,
} from "./bench/fixtures.js";
import { classifyDiff } from "./classify/index.js";
import { KbStore } from "./kb-store.js";
import { parseLog } from "./kb-log.js";
import { matchToDiff } from "./match-diff.js";

/**
 * Ceilings, not measurements — `pnpm bench` reports the distribution, and
 * these fail only on a regression in kind: a quadratic loop, a per-record read,
 * a parse where there was none. Each sits far above the number the bench
 * reports on a laptop — ten times it at the tightest — which is the headroom a
 * shared runner needs.
 *
 * Every case warms up first: the first call pays module load and JIT that a
 * gate's second call never sees, and the steady state is what a turn is
 * charged for. Should any of these ever prove flaky on a shared runner, skip
 * them on `CI=true` and say so here — none has yet.
 */

const FIXTURE_BASE = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/companion-repo/base",
);
const FIXTURE_KB = join(FIXTURE_BASE, ".strauss", "kb");

function elapsed(run: () => void): number {
  run();
  const started = performance.now();
  run();
  return performance.now() - started;
}

// A published checkout ships no `fixtures/`, and the stamp case reads one.
describe("cost ceilings", () => {
  test("matchToDiff over 1000 records and 100 hunks stays under 300ms", () => {
    const records = benchRecords(1_000, 10);
    const files = benchDiff(100, 10);
    expect(elapsed(() => void matchToDiff(files, records))).toBeLessThan(300);
  });

  test("classifyDiff over a 5000-file diff stays under 1500ms", () => {
    const files = benchDiff(5_000, 5_000, { withLines: true });
    const records = benchOverrides(200, 5_000);
    expect(elapsed(() => void classifyDiff(files, { records }))).toBeLessThan(
      1_500,
    );
  });

  test("the log reader takes under 1500ms on 100000 entries", () => {
    const raw = benchLog(100_000);
    expect(elapsed(() => void parseLog(raw))).toBeLessThan(1_500);
  });

  // `stamp` runs from a reload hook on every turn, so its cost is paid by a
  // person waiting. The 200-record ceiling lives in `commands/stamp.spec.ts`;
  // this one holds the fixture base against its own tree, so the drift pass
  // reads the anchored files rather than missing all of them.
  test.skipIf(!existsSync(FIXTURE_KB))(
    "stamping the companion fixture base stays under 250ms",
    async () => {
      const store = new KbStore();

      await store.stamp(FIXTURE_KB, { repoRoot: FIXTURE_BASE });
      const started = performance.now();
      const stamped = await store.stamp(FIXTURE_KB, { repoRoot: FIXTURE_BASE });
      const took = performance.now() - started;

      expect(stamped.recordCount).toBeGreaterThan(0);
      expect(took).toBeLessThan(250);
    },
  );
});
