import { adjudicate, type KbStanding } from "./adjudicate.js";
import type { KbRecord } from "./kb-record.schema.js";

/** One record as the catalog names it — no body, no description, one line. */
export type KbCatalogEntry = {
  conceptId: string;
  type: string;
  title: string | null;
  standing: KbStanding;
  /** Where the supersession chain ends. Empty when broken, cyclic, or n/a. */
  supersededBy: string[];
  /** `stale_after` is in the past. The one freshness signal a line can carry. */
  stale: boolean;
};

export type KbCatalogResult = {
  entries: KbCatalogEntry[];
  /** Every record the catalog names, filter applied. */
  recordCount: number;
  /** How many of those still hold — the count the load gate is held against. */
  currentCount: number;
  supersededCount: number;
  staleCount: number;
};

/**
 * The tier-one listing: every record named, nothing spelled out.
 *
 * `load` hands over bodies and `pack` hands over a neighbourhood; both have to
 * decide what the reader can afford. The catalog is the rung below either — one
 * line per record at roughly thirty tokens, so a base far past `load`'s gate
 * still fits in a single call. What it buys is the ability to choose: a reader
 * that can see every id, type, title and standing knows which record to `pack`
 * and knows when no record covers the question at all, which is the conclusion
 * a truncated read can never support.
 *
 * Standing travels on the line for the same reason it travels with every other
 * result here: a title is a claim, and a superseded claim reads exactly like a
 * live one. A superseded entry names its replacement, so the line the reader
 * should follow instead is already in front of them.
 *
 * Deliberately timestamp-free and sorted by type then title, so two catalogs of
 * an unchanged base are byte-identical and can be diffed.
 */
export function catalog(
  bundle: KbRecord[],
  options: { type?: string; now?: Date } = {},
): KbCatalogResult {
  const wanted = options.type
    ? bundle.filter((record) => record.frontmatter.type === options.type)
    : bundle;

  // Adjudicated against the whole base, not the filtered slice: a record's
  // replacement may be of another type, and a filter must not turn a
  // superseded record into a current-looking one.
  const entries = adjudicate(wanted, bundle, options.now ?? new Date())
    .map((hit) => ({
      conceptId: hit.record.conceptId,
      type: hit.record.frontmatter.type,
      title: hit.record.frontmatter.title ?? null,
      standing: hit.standing,
      supersededBy: hit.heads.map((head) => head.conceptId),
      stale: hit.warnings.some((warning) => warning.kind === "stale"),
    }))
    .sort(byTypeThenTitle);

  return {
    entries,
    recordCount: entries.length,
    currentCount: entries.filter((entry) => entry.standing === "current")
      .length,
    supersededCount: entries.filter((entry) => entry.standing === "superseded")
      .length,
    staleCount: entries.filter((entry) => entry.stale).length,
  };
}

/** Concept id is the tiebreak, so the order is total and therefore stable. */
function byTypeThenTitle(left: KbCatalogEntry, right: KbCatalogEntry): number {
  return (
    left.type.localeCompare(right.type) ||
    (left.title ?? "").localeCompare(right.title ?? "") ||
    left.conceptId.localeCompare(right.conceptId)
  );
}

/**
 * One entry, as one line.
 *
 * ` · `-separated rather than a table: a table pays for column alignment on
 * every row, and nothing downstream parses these.
 */
export function renderCatalogLine(entry: KbCatalogEntry): string {
  const parts = [
    entry.conceptId,
    entry.type,
    entry.title ?? "(untitled)",
    entry.standing === "superseded"
      ? `superseded → ${entry.supersededBy.join(", ") || "(no surviving head)"}`
      : entry.standing,
  ];
  if (entry.stale) parts.push("stale");
  return `- ${parts.join(" · ")}`;
}
