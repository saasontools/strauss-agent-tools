import type { KbRecord } from "./kb-record.schema.js";

/**
 * Selection by frontmatter `tags`. Matching is exact and no vocabulary is
 * enforced — a tag is whatever a writer put there.
 */
export type KbTagFilter = {
  /** AND: a record matches only when it carries every one of these. */
  tags?: string[];
  /** A record carrying any one of these is dropped, even if `tags` matched. */
  excludeTags?: string[];
};

/**
 * Whether one record survives the filter. An empty filter keeps everything,
 * so every caller can pass one unconditionally.
 */
export function matchesTags(record: KbRecord, filter: KbTagFilter): boolean {
  if (!filter.tags?.length && !filter.excludeTags?.length) return true;
  const carried = new Set(record.frontmatter.tags ?? []);
  return (
    (filter.tags ?? []).every((tag) => carried.has(tag)) &&
    !(filter.excludeTags ?? []).some((tag) => carried.has(tag))
  );
}
