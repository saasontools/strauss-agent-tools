/**
 * `classify` — the knowledge-base half: `review:*` facts as declarations over
 * code-diff's classifier. Importers point here, not at the files behind it.
 */
export { classifyDiff, kbDeclared } from "./classify.js";
export {
  KB_CLASSES,
  type KbClass,
  type KbClassifiedFile,
  type KbClassifiedHunk,
  type KbClassifyFile,
  type KbClassifyOptions,
  type KbClassifyResult,
  type KbVerdict,
} from "./model.js";
