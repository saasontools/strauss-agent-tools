import {
  DIFF_CLASSES,
  type ClassifiedFile,
  type ClassifiedHunk,
  type ClassifyFile,
  type ClassifyResult,
  type DiffClass,
  type SymbolRange,
  type Verdict,
} from "@saasontools/code-diff";
import type { KbRecord } from "../kb-record.schema.js";

/** code-diff's closed set of nine, under the names this package exports. */
export const KB_CLASSES = DIFF_CLASSES;
export type KbClass = DiffClass;
export type KbVerdict = Verdict;
export type KbClassifyFile = ClassifyFile;
export type KbClassifiedHunk = ClassifiedHunk;
export type KbClassifiedFile = ClassifiedFile;
export type KbClassifyResult = ClassifyResult;

export type KbClassifyOptions = {
  /** The base, for the `review:*` overrides. Adjudicated: only current wins. */
  records?: KbRecord[];
  /** Without these a symbol anchor covers its whole file rather than a hunk. */
  symbolRanges?: readonly SymbolRange[];
  now?: Date;
  /** Per path, from `.gitattributes` at the base: code-diff's `readAttributes`. */
  attributes?: ReadonlyMap<string, Verdict>;
  /** The repository declares classes itself, so the default path table is off. */
  repoDeclares?: boolean;
};
