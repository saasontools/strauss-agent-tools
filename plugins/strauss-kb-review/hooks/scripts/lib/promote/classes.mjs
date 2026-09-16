// @ts-check
/** Which anchored paths the repository calls tests. */
import { checkAttr } from "../git.mjs";

/** Paths a `.gitattributes` never reaches, spelled the way every toolchain does. */
const TEST_PATH = /(^|\/)__tests__\/|\.(spec|test)\.[cm]?[jt]sx?$/;

/**
 * A predicate over anchor paths, from the repository's own `strauss-class`
 * first and the pattern above where it says nothing. Matching, not tracking:
 * an anchor names a file in the repository the base describes, which is not
 * always the one this command runs in.
 * @param {string} cwd @param {string[]} paths @returns {(path: string) => boolean}
 */
export function testPaths(cwd, paths) {
  const unique = [...new Set(paths.filter(Boolean))];
  const { attrs } = checkAttr(cwd, null, unique, ["strauss-class"]);
  const tests = new Set(
    unique.filter(
      (path) =>
        attrs.get(path)?.["strauss-class"] === "test" || TEST_PATH.test(path),
    ),
  );
  return (path) => tests.has(path);
}
