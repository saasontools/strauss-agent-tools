import { INDEX_FILE } from "./kb-index.js";
import { LOG_FILE } from "./kb-log.js";
import { SEARCH_INDEX_FILE } from "./search-index.js";

/**
 * The files the store owns rather than a producer. Not records: listings skip
 * them, and `.gitattributes` marks them generated.
 */
export const STORE_OWNED_FILES = [INDEX_FILE, LOG_FILE, SEARCH_INDEX_FILE];

export const GITIGNORE_FILE = ".gitignore";

function block(reason: string, pattern: string): string {
  return `# BEGIN strauss-kb\n# ${reason}\n${pattern}\n# END strauss-kb\n`;
}

/**
 * Written into a base, which the store owns. Nothing outside one is the
 * store's to edit. The leading slash keeps the rule to the base that owns it,
 * and the trailing `*` covers the `-wal`, `-shm` and `-journal` files SQLite
 * writes beside the database.
 */
export const BUNDLE_IGNORE_BLOCK = block(
  "Derived, rebuilt from the records beside it.",
  `/${SEARCH_INDEX_FILE}*`,
);

/**
 * The bytes to append to put `block` in `contents`, or nothing when it is
 * already there — a newline first unless the file ends in one. Presence is the
 * whole block, byte for byte, so a later rule replaces it rather than adding a
 * second copy.
 */
export function appendIfAbsent(contents: string, block: string): string {
  if (contents.includes(block)) return "";
  const separator =
    contents.length === 0 || contents.endsWith("\n") ? "" : "\n";
  return `${separator}${block}`;
}
