import type { KbStanding, KbWarning } from "../adjudicate.js";

/**
 * Types for the inbound half of the typed causal graph. `kb-edges.ts` answers
 * "what does this record point at"; this module answers who is leaning on it,
 * and what breaks if it moves.
 */

/** One inbound typed edge: `from --rel--> the record asked about`. */
export type KbInboundEdge = {
  from: string;
  /**
   * A stored rel, not necessarily a known one, so a record carrying an
   * unrecognised rel is reported rather than dropped from the answer.
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

/**
 * One typed edge as the impact walk traversed it, both ends named. The walk
 * follows `depends_on` against the edge and `informs` along it, so a reader of
 * `via` needs the edge as written, not as walked.
 */
export type KbLinkEdge = {
  source: string;
  target: string;
  rel: string;
};

export type KbImpactOptions = {
  /**
   * Which rels the walk follows. Defaults to every rel that carries a
   * direction of dependence. A rel outside that set — unknown, or the inert
   * `related_to` — is refused rather than ignored.
   */
  rels?: readonly string[];
  /**
   * How many hops out to walk. Unbounded by default: a blast radius cut at a
   * depth the caller did not choose looks like a small one.
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
  /** Every edge that reached it, nearest first. */
  via: KbLinkEdge[];
};

export type KbImpactResult = {
  root: string;
  /** Ordered by depth, then concept id. Never includes the root itself. */
  impacted: KbImpactedRecord[];
  /**
   * Reached, reported, and not walked through: records whose standing means
   * their own declared edges no longer hold. Named rather than dropped, so the
   * caller can see where the walk stopped.
   */
  stopped: string[];
  /**
   * Whether the depth cap ended the walk with dependants still to expand. A cut
   * blast radius must say so, or it reads as a complete one that is small.
   */
  truncated: boolean;
  /** The records the depth cap left unexpanded. Empty unless `truncated`. */
  unexpanded: string[];
};
