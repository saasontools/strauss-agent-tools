import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, bench, describe } from "vitest";
import { SAMPLING, scaleCompanionBase } from "../../bench/fixtures.js";
import { KbStore } from "../../kb-store.js";
import { classifyCommand } from "./command.js";
import { resetHeaderCache } from "./header-cache.js";

/**
 * The `classify` verb over a real tree: the companion fixture's base copied
 * twenty times, every file changed. Real files rather than generated ones,
 * because the banner read is the cost being measured and a synthesized file
 * has whatever banner the generator gave it.
 *
 * The two cases are the same work with and without the per-process cache, so
 * the pair says what the cache is worth. Skipped where the fixture is not on
 * disk — a published checkout has no `fixtures/`.
 */
const COPIES = 20;

const root = mkdtempSync(join(tmpdir(), "strauss-kb-classify-bench-"));
const { files } = scaleCompanionBase(root, COPIES);
const bundle = join(root, "copy-0", ".strauss", "kb");
const store = new KbStore();
const ctx = { store, actor: "agent:bench", now: () => "" };

afterAll(() => rmSync(root, { recursive: true, force: true }));

const input = classifyCommand.input.parse({
  bundlePath: bundle,
  repoRoot: root,
  offline: true,
  files: files.map((filePath) => ({
    filePath,
    hunks: [{ startLine: 1, endLine: 3, lines: ["const value = 1;"] }],
  })),
});

describe.skipIf(!files.length)(`classify over ${COPIES} fixture copies`, () => {
  bench(
    `${files.length} files, cold banner cache`,
    async () => {
      resetHeaderCache();
      await classifyCommand.run(ctx, input);
    },
    SAMPLING,
  );

  bench(
    `${files.length} files, warm banner cache`,
    async () => {
      await classifyCommand.run(ctx, input);
    },
    SAMPLING,
  );
});
