import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, bench, describe } from "vitest";
import {
  benchLog,
  benchRecords,
  SAMPLING,
  writeBase,
} from "./bench/fixtures.js";
import { KbStore } from "./kb-store.js";
import { LOG_FILE, parseLog } from "./kb-log.js";
import { stampCommand } from "./commands/stamp.js";

/**
 * The log is append-only and never rotated, so its cost is the one that grows
 * on its own. The stamp cases stand beside it to show the other half: `stamp`
 * runs from a reload hook on every turn and must not read the log at all, so
 * its number has to stay flat as the log grows.
 */
const SIZES = [10_000, 100_000];

const store = new KbStore();
const root = mkdtempSync(join(tmpdir(), "strauss-kb-log-bench-"));

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("parseLog", () => {
  for (const entries of SIZES) {
    const raw = benchLog(entries);
    bench(
      `${entries} entries`,
      () => {
        parseLog(raw);
      },
      SAMPLING,
    );
  }
});

describe("stamp --since as the log grows", () => {
  for (const entries of SIZES) {
    const bundle = join(root, `base-${entries}`);
    writeBase(bundle, benchRecords(50, 10));
    writeFileSync(join(bundle, LOG_FILE), benchLog(entries), "utf8");
    const input = stampCommand.input.parse({
      bundlePath: bundle,
      since: "0".repeat(64),
    });
    bench(
      `50 records, ${entries} log entries`,
      async () => {
        await stampCommand.run(
          { store, actor: "agent:bench", now: () => "" },
          input,
        );
      },
      SAMPLING,
    );
  }
});
