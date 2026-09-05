/**
 * `kb_match`: which records sit on each changed hunk.
 *
 * The unified-diff parser lives here rather than in the library, which takes a
 * structural description of a change and no patch.
 */
export { matchCommand } from "./command.js";
export { KbMatchInputError } from "./errors.js";
export {
  diffFileSchema,
  diffHunkSchema,
  type KbMatch,
  type KbMatchRecord,
} from "./model.js";
export {
  parseUnifiedDiff,
  type ParseDiffOptions,
} from "./parse-unified-diff.js";
export { resolveSymbolRanges } from "./symbol-ranges.js";
