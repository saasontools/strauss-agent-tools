export { readAttributes, type Attributes } from "./attributes.js";
export { classifyDiff } from "./classify.js";
export {
  DIFF_CLASSES,
  type ClassifiedFile,
  type ClassifiedHunk,
  type ClassifyFile,
  type ClassifyOptions,
  type ClassifyResult,
  type Declared,
  type DiffClass,
  type Verdict,
} from "./model.js";
export { classifyFiles, type ClassifyFilesOptions } from "./read.js";
export {
  attributeVerdict,
  CLASS_ATTRIBUTES,
  DEFAULT_PATH_RULES,
  generatedMarker,
  GENERATED_MARKERS,
  HEADER_LINES,
  pathRule,
  type PathRule,
} from "./rules.js";
