import type { KbStanding } from "../adjudicate.js";

/**
 * What a record explicitly points at — the question a consumer about to warn
 * or about to delete has to ask, where `kb-edges.ts` answers it for a walk and
 * `kb-links/` answers the causal inverse.
 */

/** Where a reference is written: the record's prose, or its `strauss_links`. */
export type KbReferenceOrigin = "body" | "link";

/** Fixed order, so a pair stated both ways always reads the same. */
export const KB_REFERENCE_ORIGINS: readonly KbReferenceOrigin[] = [
  "body",
  "link",
];

/** One target a record points at, with every way it points at it. */
export type KbOutboundReference = {
  target: string;
  origins: KbReferenceOrigin[];
  /** Rels declared for this target, in declaration order. Empty for a body-only citation. */
  rels: string[];
};

/** A record that still holds, pointing at one that does not. */
export type KbStaleReference = {
  from: string;
  target: string;
  /** Always `superseded` or `rejected` — the standings that stopped holding. */
  targetStanding: Extract<KbStanding, "superseded" | "rejected">;
  origins: KbReferenceOrigin[];
  rels: string[];
  /** The replacement chain, nearest first, limited to ids the bundle holds. */
  replacedBy: string[];
};

/** A record that still holds, pointing at the record being reassessed. */
export type KbLiveReference = {
  from: string;
  title: string | null;
  standing: KbStanding;
  origins: KbReferenceOrigin[];
  rels: string[];
};
