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
  /**
   * How many records hold each standing. Sums to `recordCount` — every record
   * has exactly one standing, so the reader can see that nothing went missing.
   */
  standings: Record<KbStanding, number>;
  /**
   * What `load` would hand over as whole records, and therefore exactly what
   * its record gate counts: everything except the superseded, which arrive as
   * one-line stubs and are not pages. A catalog reader comparing this to the
   * gate can predict a refusal before making the call.
   */
  pageCount: number;
  /** Shorthand for `standings.current` — records that simply hold. */
  currentCount: number;
  /** Shorthand for `standings.superseded`. */
  supersededCount: number;
  /**
   * Records whose `stale_after` has passed. A flag over the standings rather
   * than one of them — a current record can be stale — so this deliberately
   * does not participate in the sum.
   */
  staleCount: number;
};

const EMPTY_STANDINGS: Record<KbStanding, number> = {
  current: 0,
  superseded: 0,
  rejected: 0,
  unsettled: 0,
  open: 0,
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
 * Unbounded, alone among the read paths. `load` and `pack` refuse past a
 * ceiling because a partial body set reads as a complete one; a catalog has no
 * such failure — it is the rung a caller lands on *because* something else
 * refused, and a second refusal there would leave nowhere to go. The cost is
 * linear and cheap: roughly thirty tokens a record, so a thousand-record base
 * is about 30k and five thousand about 150k. Past that the `type` filter
 * narrows it, and no ceiling is needed to make that available.
 *
 * Deterministic given a fixed `now`: no timestamp is emitted, and the ordering
 * is total down to the concept id, so two catalogs of an unchanged base within
 * one `stale_after` window are byte-identical and diff to nothing. The default
 * clock is the wall clock, so a line can still flip to stale as a date passes —
 * pass `now` when byte-equality has to hold across that boundary.
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

  const standings = { ...EMPTY_STANDINGS };
  for (const entry of entries) standings[entry.standing] += 1;

  return {
    entries,
    recordCount: entries.length,
    standings,
    pageCount: entries.length - standings.superseded,
    currentCount: standings.current,
    supersededCount: standings.superseded,
    staleCount: entries.filter((entry) => entry.stale).length,
  };
}

/** Concept id is the tiebreak, so the order is total and therefore stable. */
function byTypeThenTitle(left: KbCatalogEntry, right: KbCatalogEntry): number {
  return (
    byCodeUnit(left.type, right.type) ||
    byCodeUnit(left.title ?? "", right.title ?? "") ||
    byCodeUnit(left.conceptId, right.conceptId)
  );
}

/**
 * Code-unit order, not `localeCompare`.
 *
 * `localeCompare` without an explicit locale reads the host's, so the same
 * base sorts differently on two machines — and this output's whole contract is
 * that two catalogs of an unchanged base diff to nothing. A collation nobody
 * configured is not worth a determinism claim that quietly does not hold.
 */
function byCodeUnit(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
