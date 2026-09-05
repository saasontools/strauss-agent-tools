import type { KbRecord } from "../kb-record.schema.js";
import type { DiffFile, SymbolRange } from "../match-diff.js";

/**
 * What a reviewer can skim and what they must read, derived from the diff.
 *
 * A closed set: a consumer branches on these nine, and a tenth would arrive
 * unhandled. `source` is the residue — everything no rule claimed.
 */
export const KB_CLASSES = [
  "test",
  "config",
  "ci",
  "docs",
  "lockfile",
  "generated",
  "boilerplate",
  "rename",
  "source",
] as const;

export type KbClass = (typeof KB_CLASSES)[number];

/** A diff file, plus the head lines a caller could read for it. */
export type KbClassifyFile = DiffFile & {
  /** The file's first lines at head. Absent falls back to the diff's own. */
  header?: string[];
};

export type KbClassifyThresholds = {
  /** Share of a file's changed lines that must match a boilerplate shape. */
  boilerplate?: number;
  /** The `git diff -M` similarity a rename needs before it is called one. */
  rename?: number;
};

export const DEFAULT_THRESHOLDS: Required<KbClassifyThresholds> = {
  boilerplate: 0.8,
  rename: 90,
};

export type KbClassifyOptions = {
  /** The base, for the `review:*` overrides. Adjudicated: only current wins. */
  records?: KbRecord[];
  /** Without these a symbol anchor covers its whole file rather than a hunk. */
  symbolRanges?: readonly SymbolRange[];
  now?: Date;
  thresholds?: KbClassifyThresholds;
};

/** The class and the name of the rule that produced it. */
export type KbVerdict = { class: KbClass; reason: string };

export type KbClassifiedHunk = KbVerdict & {
  startLine: number;
  endLine: number;
};

export type KbClassifiedFile = KbVerdict & {
  filePath: string;
  renamedFrom?: string;
  /** Present only where some hunk's class differs from the file's. */
  hunks?: KbClassifiedHunk[];
};

export type KbClassifyResult = { files: KbClassifiedFile[] };
