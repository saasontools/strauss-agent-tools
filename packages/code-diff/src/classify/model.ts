import type { DiffFile, DiffHunk } from "../model.js";

/**
 * What a reviewer can skim and what they must read. A closed set: a consumer
 * branches on these nine. `source` is the residue — everything nothing
 * declared.
 */
export const DIFF_CLASSES = [
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

export type DiffClass = (typeof DIFF_CLASSES)[number];

/** The class and the name of what declared it. */
export type Verdict = { class: DiffClass; reason: string };

/** A diff file, plus the head lines a caller could read for it. */
export type ClassifyFile = DiffFile & {
  /** The file's first lines at head. Absent falls back to the diff's own. */
  header?: string[];
};

/** Verdicts the caller's own records assert, for a whole file or one hunk. */
export type Declared = {
  file(filePath: string): Verdict | undefined;
  hunk(filePath: string, hunk: DiffHunk): Verdict | undefined;
};

export type ClassifyOptions = {
  declared?: Declared;
  /** Per path, from `.gitattributes` at the base: see `readAttributes`. */
  attributes?: ReadonlyMap<string, Verdict>;
  /** The repository declares classes itself, so the default path table is off. */
  repoDeclares?: boolean;
};

export type ClassifiedHunk = Verdict & { startLine: number; endLine: number };

export type ClassifiedFile = Verdict & {
  filePath: string;
  renamedFrom?: string;
  /** Present only where some hunk's class differs from the file's. */
  hunks?: ClassifiedHunk[];
};

export type ClassifyResult = {
  files: ClassifiedFile[];
  /** How the answer was reached where it is weaker than asked, e.g. unpinned attributes. */
  notes?: string[];
};
