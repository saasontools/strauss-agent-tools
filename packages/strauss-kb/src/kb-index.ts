import type { KbRecord } from "./kb-record.schema.js";

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
    .map((record) => {
      const { frontmatter: fm } = record;
      const parts = [fm.type, fm.strauss_status];
      if (fm.tags?.length) parts.push(`tags: ${fm.tags.join(", ")}`);
      if (fm.description) parts.push(fm.description);
      return `- [${fm.title ?? record.conceptId}](${record.conceptId}.md) — ${parts.join(" · ")}`;
    });

  return `${HEADING}\n\n${lines.join("\n")}\n`;
}

/** Whether the stored projection still matches the records it claims to index. */
export function indexIsStale(stored: string | null, expected: string): boolean {
  return stored !== expected;
}
