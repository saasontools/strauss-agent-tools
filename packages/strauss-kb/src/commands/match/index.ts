/** `kb_match`: which records sit on each changed hunk. */
export { matchCommand } from "./command.js";
export { KbMatchInputError } from "./errors.js";
export {
  diffFileSchema,
  diffHunkSchema,
  type KbMatch,
  type KbMatchRecord,
} from "./model.js";
export { resolveSymbolRanges } from "./symbol-ranges.js";
