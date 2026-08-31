import { LOG_FILE } from "./kb-log.js";

export const GITATTRIBUTES_FILE = ".gitattributes";

/**
 * Declares the log's merge driver, plus line endings.
 *
 * `merge=union` interleaves both sides' lines instead of the ordinary
 * line-level merge, which can drop one side's appends outright. The log is
 * append-only JSONL and two worktrees against the same bundle is the normal
 * case, not an edge case — `kb_log`'s reader sorts on `at` and dedupes exact
 * repeats (`kb-log.ts`), so interleaved line order — or a line a union merge
 * happened to keep twice — coming out of a merge is exactly as readable as a
 * single writer's log.
 *
 * `text eol=lf` pins line endings to `\n` regardless of a checkout's
 * `core.autocrlf`. Without it, Windows with `autocrlf=true` normalizes the
 * file to CRLF on checkout while every append after that (`O_APPEND`, raw
 * `\n`) keeps writing LF — a file with mixed endings, which is exactly the
 * kind of divergence a merge driver can't paper over.
 */
export const UNION_MERGE_LINE = `${LOG_FILE} text eol=lf merge=union`;

/**
 * One parsed `.gitattributes` line: the pattern and its whitespace-separated
 * attributes. `null` for a blank line or a `#` comment — gitattributes
 * ignores both.
 */
function parseLine(line: string): { pattern: string; attrs: string[] } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const [pattern, ...attrs] = trimmed.split(/\s+/);
  return pattern === undefined ? null : { pattern, attrs };
}

/**
 * Whether `contents` already assigns *any* `merge` attribute to the log
 * file — our own `merge=union`, a plain `merge` (the default driver), an
 * explicit `-merge` (merging disabled), or a user's own choice such as
 * `merge=ours`.
 *
 * Exact-string matching against `UNION_MERGE_LINE` was the first cut, and it
 * both under- and over-reaches: a line with a tab or doubled space between
 * tokens, or one that also sets an unrelated attribute alongside `merge`,
 * would not match and get a harmless-looking but wrong second line appended
 * — and it can never see a deliberate `merge=ours` as "already decided",
 * which is the one case where appending anything at all would be wrong.
 * Whitespace-tokenizing the pattern and attributes separately answers the
 * question this function actually needs answered: does *some* line already
 * give `log.jsonl` a merge strategy, whatever it is — and if so, that
 * strategy is left alone rather than layered under a second, possibly
 * conflicting one. gitattributes itself resolves multiple matching lines by
 * "last one wins", so appending a second `merge=` line for the same pattern
 * would silently override a user's `merge=ours` with `merge=union` — the
 * opposite of respecting what they set.
 */
export function hasMergeDeclaration(contents: string): boolean {
  return contents.split("\n").some((line) => {
    const parsed = parseLine(line);
    if (!parsed || parsed.pattern !== LOG_FILE) return false;
    return parsed.attrs.some(
      (attr) =>
        attr === "merge" || attr === "-merge" || attr.startsWith("merge="),
    );
  });
}

/**
 * The bytes to append to a `.gitattributes` that does not yet declare a
 * merge strategy for the log — a newline first, unless `contents` already
 * ends in one, so the line lands on its own rather than tacked onto the
 * file's last line.
 */
export function appendUnionMergeLine(contents: string): string {
  const separator =
    contents.length === 0 || contents.endsWith("\n") ? "" : "\n";
  return `${separator}${UNION_MERGE_LINE}\n`;
}
