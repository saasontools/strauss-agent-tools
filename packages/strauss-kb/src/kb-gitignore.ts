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

/** A blank line or a `#` comment; git gives neither any meaning. */
function isNoise(line: string): boolean {
  return line.trim() === "" || line.startsWith("#");
}

/**
 * The pattern a line holds. Only trailing whitespace goes: git keeps leading
 * whitespace as part of the pattern, so `  *.sqlite*` matches a name starting
 * with two spaces and settles nothing.
 */
function pattern(line: string): string {
  return line.replace(/\s+$/, "");
}

/**
 * Whether `pattern` matches `name`, a file directly beside the ignore file.
 * A directory pattern or one addressing a deeper path matches no such file.
 */
function matchesChild(pattern: string, name: string): boolean {
  if (pattern.endsWith("/")) return false;
  const anchored = pattern.startsWith("/") ? pattern.slice(1) : pattern;
  if (anchored.includes("/")) return false;
  return globMatches(anchored, name);
}

/**
 * `*` and `?` against a bare name, by one forward scan with a single backtrack
 * point: linear in the name. A regex of adjacent `[^/]*` groups is not — a
 * checked-in line of 14 stars backtracks for 84 seconds, in a synchronous call
 * every mutation makes.
 *
 * Any other construct — a bracket expression, a backslash escape — is matched
 * literally and so fails to match, which costs a redundant rule and never a
 * missing one.
 */
function globMatches(pattern: string, name: string): boolean {
  let p = 0;
  let n = 0;
  let star = -1;
  let retry = 0;
  while (n < name.length) {
    const char = pattern[p];
    if (
      char === "?" ||
      (char !== undefined && char !== "*" && char === name[n])
    ) {
      p += 1;
      n += 1;
    } else if (char === "*") {
      star = p;
      p += 1;
      retry = n;
    } else if (star >= 0) {
      retry += 1;
      p = star + 1;
      n = retry;
    } else {
      return false;
    }
  }
  while (pattern[p] === "*") p += 1;
  return p === pattern.length;
}

/** What git's last matching line says about `name`, or `null` for no match. */
function verdict(contents: string, name: string): "ignore" | "unignore" | null {
  let answer: "ignore" | "unignore" | null = null;
  for (const line of contents.split("\n")) {
    if (isNoise(line)) continue;
    const candidate = pattern(line);
    const negated = candidate.startsWith("!");
    if (matchesChild(negated ? candidate.slice(1) : candidate, name)) {
      answer = negated ? "unignore" : "ignore";
    }
  }
  return answer;
}

/**
 * What `contents` already does about one rule: every covered file ignored, a
 * `!` line un-ignoring one, or neither — see
 * decision.kb-ignore-idempotence-by-covered-files. Only `missing` is written.
 */
export type IgnoreRuleState = "ignored" | "unignored" | "missing";

export function ignoreRuleState(
  contents: string,
  rule: IgnoreRule,
): IgnoreRuleState {
  const verdicts = rule.covers.map((name) => verdict(contents, name));
  if (verdicts.includes("unignore")) return "unignored";
  return verdicts.every((each) => each === "ignore") ? "ignored" : "missing";
}

/** Whether `contents` already answers for a rule, either way. */
function isSettled(contents: string, rule: IgnoreRule): boolean {
  return ignoreRuleState(contents, rule) !== "missing";
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
