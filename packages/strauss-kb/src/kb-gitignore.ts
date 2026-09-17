import { basename } from "node:path";
import { PINS_LOCAL_FILE } from "./kb-pins/model.js";
import { SEARCH_INDEX_FILE } from "./search-index.js";

export const GITIGNORE_FILE = ".gitignore";

const BEGIN = "# BEGIN strauss-kb";
const END = "# END strauss-kb";

/**
 * A block of ignore rules, written whole and replaced whole. Markers make the
 * block addressable, so a later rule is a revision rather than a second append.
 */
export type IgnoreBlock = {
  /** The patterns it writes, for reporting when it is not written. */
  patterns: readonly string[];
  /** The names the block excludes, checked against a `!` line. */
  covers: readonly string[];
  /** The block, markers included, ending in a newline. */
  text: string;
};

function block(
  reason: string,
  patterns: string[],
  covers: string[],
): IgnoreBlock {
  return {
    patterns,
    covers,
    text: `${BEGIN}\n# ${reason}\n${patterns.join("\n")}\n${END}\n`,
  };
}

/**
 * SQLite writes `-wal`, `-shm` and `-journal` beside the database, so the
 * pattern is a prefix glob. Anchored: a base excludes its own, not a parent's.
 */
export const BUNDLE_IGNORE_BLOCK: IgnoreBlock = block(
  "Derived, rebuilt from the records beside it.",
  [`/${SEARCH_INDEX_FILE}*`],
  [
    SEARCH_INDEX_FILE,
    `${SEARCH_INDEX_FILE}-wal`,
    `${SEARCH_INDEX_FILE}-shm`,
    `${SEARCH_INDEX_FILE}-journal`,
  ],
);

/**
 * Personal pins, at `<workspace>/.strauss/.gitignore` — the committed
 * `kb-pins.json` sits beside them, so the pattern names one file exactly.
 */
export const STRAUSS_IGNORE_BLOCK: IgnoreBlock = block(
  "Personal, not the team's.",
  [`/${basename(PINS_LOCAL_FILE)}`],
  [basename(PINS_LOCAL_FILE)],
);

/**
 * Whether a line deliberately un-ignores one of `covers`. A literal `!name`
 * only: git resolves repeated matches by last one wins, so writing the block
 * over such a line would overrule it, and a literal is the case worth reading
 * without taking on git's glob semantics.
 */
function unignores(contents: string, covers: readonly string[]): boolean {
  return contents.split("\n").some((line) => {
    const trimmed = line.replace(/\s+$/, "");
    if (!trimmed.startsWith("!")) return false;
    const name = trimmed.slice(1).replace(/^\//, "");
    return covers.includes(name);
  });
}

/** What `contents` already does about a block. Only `missing` is written. */
export type IgnoreBlockState = "present" | "unignored" | "missing";

export function ignoreBlockState(
  contents: string,
  target: IgnoreBlock,
): IgnoreBlockState {
  if (contents.includes(target.text)) return "present";
  if (unignores(contents, target.covers)) return "unignored";
  return "missing";
}

/**
 * The bytes to append to bring `contents` up to date — a newline first unless
 * it already ends in one. Empty when the block is there, or when the reader
 * un-ignored one of the files it covers.
 */
export function appendIgnoreBlock(
  contents: string,
  target: IgnoreBlock,
): string {
  if (ignoreBlockState(contents, target) !== "missing") return "";
  const separator =
    contents.length === 0 || contents.endsWith("\n") ? "" : "\n";
  return `${separator}${target.text}`;
}
