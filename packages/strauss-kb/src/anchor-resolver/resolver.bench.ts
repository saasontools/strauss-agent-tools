import { bench, describe } from "vitest";
import {
  benchSymbol,
  braceSource,
  plainSource,
  plainSymbol,
  SAMPLING,
} from "../bench/fixtures.js";
import { regexResolver } from "./resolver.js";

/**
 * The brace-scoped heuristic on a file big enough to matter, and on one with
 * no braces at all — where every candidate walks to the end of the file rather
 * than to a closing brace. The second is the shape that decides whether the
 * resolver is linear in the file or in the file squared.
 */
const LINES = 5_000;
const braced = braceSource(LINES);
const plain = plainSource(LINES);

describe("regexResolver", () => {
  bench(
    `${LINES}-line brace-scoped file`,
    () => {
      regexResolver.resolve(braced, benchSymbol(400));
    },
    SAMPLING,
  );

  bench(
    `${LINES}-line file with no braces`,
    () => {
      regexResolver.resolve(plain, plainSymbol(17));
    },
    SAMPLING,
  );
});
