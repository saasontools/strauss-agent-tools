import { basename } from "node:path";
import { PINS_LOCAL_FILE } from "./kb-pins/model.js";
import { SEARCH_INDEX_FILE } from "./search-index.js";

export const GITIGNORE_FILE = ".gitignore";

/**
 * One ignore line, with the files it exists to exclude. `covers` is what
 * decides idempotence: a rule whose files are already ignored is not written
 * again, whatever pattern did the ignoring.
 */
export type IgnoreRule = { pattern: string; covers: readonly string[] };

/**
 * SQLite writes `-wal`, `-shm` and `-journal` beside the database, so the
 * rule is a prefix glob rather than the one file name.
 */
export const SEARCH_INDEX_RULE: IgnoreRule = {
  pattern: `/${SEARCH_INDEX_FILE}*`,
  covers: [
    SEARCH_INDEX_FILE,
    `${SEARCH_INDEX_FILE}-wal`,
    `${SEARCH_INDEX_FILE}-shm`,
    `${SEARCH_INDEX_FILE}-journal`,
  ],
};

/** What a base's `.gitignore` carries. Anchored: a rule per base, no reach up. */
export const BUNDLE_IGNORE_RULES: readonly IgnoreRule[] = [SEARCH_INDEX_RULE];

/**
 * Personal pins, ignored at `<workspace>/.strauss/.gitignore` — the committed
 * `kb-pins.json` sits beside them, so the pattern names one file exactly.
 */
export const LOCAL_PINS_RULE: IgnoreRule = {
  pattern: `/${basename(PINS_LOCAL_FILE)}`,
  covers: [basename(PINS_LOCAL_FILE)],
};

export const STRAUSS_IGNORE_RULES: readonly IgnoreRule[] = [LOCAL_PINS_RULE];

/** A blank line or a `#` comment; git ignores both. */
function isNoise(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "" || trimmed.startsWith("#");
}

/**
 * Whether `pattern` matches `name`, a file directly beside the ignore file.
 * Only `*` and `?` are expanded; an unsupported construct fails to match and
 * costs a redundant rule, never a wrong one.
 */
function matchesChild(pattern: string, name: string): boolean {
  if (pattern.endsWith("/")) return false; // directories only
  const anchored = pattern.startsWith("/") ? pattern.slice(1) : pattern;
  if (anchored.includes("/")) return false; // addresses a deeper path
  const expression = anchored.replace(/[.*+?^${}()|[\]\\]/g, (char) =>
    char === "*" ? "[^/]*" : char === "?" ? "[^/]" : `\\${char}`,
  );
  return new RegExp(`^${expression}$`).test(name);
}

/** What git's last matching line says about `name`, or `null` for no match. */
function verdict(contents: string, name: string): "ignore" | "unignore" | null {
  let answer: "ignore" | "unignore" | null = null;
  for (const line of contents.split("\n")) {
    if (isNoise(line)) continue;
    const trimmed = line.trim();
    const negated = trimmed.startsWith("!");
    if (matchesChild(negated ? trimmed.slice(1) : trimmed, name)) {
      answer = negated ? "unignore" : "ignore";
    }
  }
  return answer;
}

/**
 * A rule is settled when every file it covers is already ignored, or when the
 * reader deliberately un-ignored one: git resolves repeated matches by "last
 * one wins", so appending over a `!` line would overrule that choice.
 */
function isSettled(contents: string, rule: IgnoreRule): boolean {
  const verdicts = rule.covers.map((name) => verdict(contents, name));
  return (
    verdicts.includes("unignore") || verdicts.every((each) => each === "ignore")
  );
}

/** The patterns `contents` still lacks, in rule order. */
export function missingIgnoreLines(
  contents: string,
  rules: readonly IgnoreRule[],
): string[] {
  return rules
    .filter((rule) => !isSettled(contents, rule))
    .map((rule) => rule.pattern);
}

/**
 * The bytes to append to bring `contents` up to date — a newline first unless
 * it already ends in one. Empty when nothing is missing.
 */
export function appendIgnoreLines(
  contents: string,
  rules: readonly IgnoreRule[],
): string {
  const lines = missingIgnoreLines(contents, rules);
  if (lines.length === 0) return "";
  const separator =
    contents.length === 0 || contents.endsWith("\n") ? "" : "\n";
  return `${separator}${lines.join("\n")}\n`;
}

/** What a `.gitignore` created from nothing contains, per location. */
export const BUNDLE_GITIGNORE_BLOCK = appendIgnoreLines(
  "",
  BUNDLE_IGNORE_RULES,
);
export const STRAUSS_GITIGNORE_BLOCK = appendIgnoreLines(
  "",
  STRAUSS_IGNORE_RULES,
);
