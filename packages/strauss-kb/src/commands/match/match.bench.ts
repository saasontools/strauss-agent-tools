import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, bench, describe } from "vitest";
import {
  benchDiff,
  benchFile,
  benchRecords,
  braceSource,
  SAMPLING,
  writeBase,
} from "../../bench/fixtures.js";
import { KbStore } from "../../kb-store.js";
import { matchCommand } from "./command.js";

/**
 * The whole `match` verb: listing the base off disk, resolving symbol ranges
 * over the changed files, and projecting. `matchToDiff` alone is the pure half;
 * this is what a gate actually pays.
 *
 * `offline` so no bench reaches a grammar CDN — the resolver falls back to the
 * regex heuristic where a pack is not already cached.
 */
const RECORDS = [100, 1_000, 10_000];
const HUNKS = [10, 100, 1_000];

const store = new KbStore();
const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const built = new Map<string, { bundle: string; repo: string }>();

/** Memoised: tinybench calls a bench's setup once to warm up and once to run. */
function workspace(
  records: number,
  files: number,
): {
  bundle: string;
  repo: string;
} {
  const at = `${records}:${files}`;
  const held = built.get(at);
  if (held) return held;
  const root = mkdtempSync(join(tmpdir(), "strauss-kb-match-bench-"));
  roots.push(root);
  const bundle = join(root, "kb");
  const repo = join(root, "repo");
  writeBase(bundle, benchRecords(records, files));
  const source = braceSource(200);
  for (let at = 0; at < files; at += 1) {
    const path = join(repo, benchFile(at));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source, "utf8");
  }
  const made = { bundle, repo };
  built.set(at, made);
  return made;
}

describe("match", () => {
  for (const records of RECORDS) {
    for (const hunks of HUNKS) {
      const files = Math.max(1, Math.ceil(hunks / 10));
      let input: ReturnType<typeof matchCommand.input.parse>;
      bench(
        `${records} records x ${hunks} hunks`,
        async () => {
          await matchCommand.run(
            { store, actor: "agent:bench", now: () => "" },
            input,
          );
        },
        {
          ...SAMPLING,
          // Written in setup, not at collection: `vitest bench -t` still walks
          // this loop, and a filtered run should not write all nine trees.
          setup: () => {
            const { bundle, repo } = workspace(records, files);
            input = matchCommand.input.parse({
              bundlePath: bundle,
              repoRoot: repo,
              offline: true,
              files: benchDiff(hunks, files),
            });
          },
        },
      );
    }
  }
});
