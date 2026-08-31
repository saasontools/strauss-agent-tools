import { LOG_FILE } from "./kb-log.js";

export const GITATTRIBUTES_FILE = ".gitattributes";

/**
 * Declares the log's merge driver: interleave both sides' lines instead of
 * the ordinary line-level merge, which can drop one side's appends outright.
 *
 * The log is append-only JSONL and two worktrees against the same bundle is
 * the normal case, not an edge case — `kb_log`'s reader sorts on `at`
 * (`kb-log.ts`), so interleaved line order coming out of a union merge is
 * exactly as readable as a single writer's log.
 */
export const UNION_MERGE_LINE = `${LOG_FILE} merge=union`;

/** Whether `contents` already declares the line, on a line of its own. */
export function hasUnionMergeLine(contents: string): boolean {
  return contents.split("\n").some((line) => line.trim() === UNION_MERGE_LINE);
}

/**
 * The bytes to append to a `.gitattributes` that does not yet carry the line
 * — a newline first, unless `contents` already ends in one, so the line
 * lands on its own rather than tacked onto the file's last line.
 */
export function appendUnionMergeLine(contents: string): string {
  const separator =
    contents.length === 0 || contents.endsWith("\n") ? "" : "\n";
  return `${separator}${UNION_MERGE_LINE}\n`;
}
