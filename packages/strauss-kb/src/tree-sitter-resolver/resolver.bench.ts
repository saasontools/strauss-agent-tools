import { bench, describe } from "vitest";
import {
  benchSymbol,
  braceSource,
  plainSource,
  SAMPLING,
} from "../bench/fixtures.js";
import { TreeSitterResolver } from "./resolver.js";

/**
 * The AST resolver on the same two files the regex bench uses, so the pair can
 * be read against each other.
 *
 * Cached grammars only. A bench that downloads measures a CDN, so an absent
 * pack skips the case rather than fetching it. `test/grammars.setup.ts` runs
 * for `bench` too and points the cache at a shared directory, which one
 * `pnpm test` fills from the fixture server — no network needed.
 */
const LINES = 5_000;
const BRACED = "src/bench/braced.ts";
const PLAIN = "src/bench/plain.txt";

const braced = braceSource(LINES);
const plain = plainSource(LINES);

const resolver = new TreeSitterResolver({ offline: true });
const cached = await prepare();

async function prepare(): Promise<boolean> {
  await resolver.prepare([BRACED]);
  return resolver.resolve(braced, benchSymbol(400), BRACED) !== null;
}

describe.skipIf(!cached)("TreeSitterResolver", () => {
  bench(
    `${LINES}-line TypeScript file`,
    () => {
      resolver.reset();
      resolver.resolve(braced, benchSymbol(400), BRACED);
    },
    SAMPLING,
  );

  // `.txt` has no grammar, so this is the abstain path: the cost of deciding
  // there is nothing to parse, which every non-source file in a diff pays.
  bench(
    `${LINES}-line file with no grammar`,
    () => {
      resolver.resolve(plain, benchSymbol(17), PLAIN);
    },
    SAMPLING,
  );
});
