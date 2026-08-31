import type { KbStanding, KbWarning } from "../adjudicate.js";

/**
 * Types for the inbound half of the typed causal graph.
 *
 * `kb-edges.ts` answers "what does this record point at" — the outbound edges a
 * record declares on itself. This module answers the other direction, which is
 * the one a reviewer actually asks: who is leaning on this, and what breaks if
 * it moves.
 */

/** One inbound typed edge: `from --rel--> the record asked about`. */
export type KbInboundEdge = {
  from: string;
  /**
   * A stored rel, not necessarily a known one. Kept as a plain string so a
   * record carrying an unrecognised rel is reported rather than silently
   * dropped from the answer — `kb_validate` is where that becomes an error.
   */
  rel: string;
};

/** One record pointing at the target, with the standing of what it claims. */
export type KbBacklink = KbInboundEdge & {
  title: string | null;
  standing: KbStanding;
  warnings: KbWarning[];
};

export type KbBacklinksResult = {
  target: string;
  /** Every inbound edge, whatever its rel. Ordered by source id, then rel. */
  backlinks: KbBacklink[];
};

export type KbImpactOptions = {
  /**
   * Which rels the walk follows. Defaults to the causal ones — every rel but
   * `related_to`, which is a pointer rather than a dependence.
   */
  rels?: readonly string[];
  /**
   * How many hops out to walk. Unbounded by default: a blast radius cut at a
   * depth the caller did not choose looks exactly like a small one.
   */
  depth?: number;
};

export type KbImpactedRecord = {
  conceptId: string;
  title: string | null;
  standing: KbStanding;
  warnings: KbWarning[];
  /** Hops from the record asked about. 1 is a direct dependant. */
  depth: number;
  /** Every inbound edge that reached it, nearest first. */
  via: KbInboundEdge[];
};

export type KbImpactResult = {
  root: string;
  /** Ordered by depth, then concept id. Never includes the root itself. */
  impacted: KbImpactedRecord[];
  /**
   * Reached, reported, and not walked through: records whose standing means
   * their own declared edges no longer hold. Named rather than dropped, so the
   * caller can see where the walk stopped instead of inferring an end.
   */
  stopped: string[];
};
