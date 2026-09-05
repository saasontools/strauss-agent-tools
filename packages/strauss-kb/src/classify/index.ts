/**
 * `classify` — what kind of change each file of a diff carries. Importers
 * point here, not at the files behind it.
 */
export { classifyDiff } from "./classify.js";
export {
  DEFAULT_THRESHOLDS,
  KB_CLASSES,
  type KbClass,
  type KbClassifiedFile,
  type KbClassifiedHunk,
  type KbClassifyFile,
  type KbClassifyOptions,
  type KbClassifyResult,
  type KbClassifyThresholds,
  type KbVerdict,
} from "./model.js";
export {
  generatedMarker,
  isBoilerplateLine,
  BOILERPLATE_SHAPES,
  GENERATED_MARKERS,
  HEADER_LINES,
  PATH_RULES,
  type KbPathRule,
} from "./rules.js";
