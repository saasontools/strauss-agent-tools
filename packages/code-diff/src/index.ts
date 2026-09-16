export type { DiffFile, DiffHunk, SymbolRange } from "./model.js";
export {
  parseUnifiedDiff,
  type ParseDiffOptions,
} from "./parse-unified-diff.js";
export * from "./repo/index.js";
export { digest } from "./digest.js";
export {
  changedSymbols,
  contextSymbol,
  type ChangedSymbol,
  type Declaration,
} from "./changed-symbols.js";
export {
  draftGitattributes,
  draftGitattributesFrom,
} from "./draft-gitattributes.js";
export * from "./classify/index.js";
