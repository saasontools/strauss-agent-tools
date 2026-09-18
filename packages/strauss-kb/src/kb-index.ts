import type { KbRecord } from "./kb-record.schema.js";
import { oneLine } from "./one-line.js";

export const INDEX_FILE = "INDEX.md";

const HEADING = "# KB Index";

/**
 * `INDEX.md` is a projection — every byte recomputable from record frontmatter.
 *
 * That is what lets parallel writers regenerate it without a lock: they compute
 * the same function of the same records, so two concurrent regenerations differ
 * only in how recent each writer's scan was, and the next read settles it. The
 * file is therefore eventually correct rather than always correct, which is the
 * right trade for something nothing reads transactionally.
 *
 * Lines carry `description`, not just a title. A reader consults the index to
 * decide what is worth opening, and a list of titles does not answer that.
 */
export function renderIndex(records: KbRecord[]): string {
  const lines = [...records]
    .sort((left, right) => left.conceptId.localeCompare(right.conceptId))
    .map(renderIndexLine);

  return `${HEADING}\n\n${lines.join("\n")}\n`;
}

/**
 * One record's index line. The single writer of this shape — `context` emits
 * the same line rather than growing a second index renderer that would drift
 * from this one.
 */
export function renderIndexLine(record: KbRecord): string {
  const { frontmatter: fm } = record;
  const parts = [fm.type, fm.strauss_status];
  // Foreign text is flattened so a line cannot forge another; the description
  // and tags are the payload, so they are flattened but not cut.
  if (fm.tags?.length)
    parts.push(`tags: ${oneLine(fm.tags.join(", "), Infinity)}`);
  if (fm.description) parts.push(oneLine(fm.description, Infinity));
  return `- [${fm.title ? oneLine(fm.title) : record.conceptId}](${record.conceptId}.md) — ${parts.join(" · ")}`;
}

/** Whether the stored projection still matches the records it claims to index. */
export function indexIsStale(stored: string | null, expected: string): boolean {
  return stored !== expected;
}
