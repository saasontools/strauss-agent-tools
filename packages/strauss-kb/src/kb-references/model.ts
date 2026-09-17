import type { KbStanding } from "../adjudicate.js";

/**
 * What a record explicitly points at — the question a consumer about to warn
 * or about to delete has to ask, where `kb-edges.ts` answers it for a walk and
 * `kb-links/` answers the causal inverse.
 */

/** One target a record points at, with every claim it makes about it. */
export type KbOutboundReference = {
  target: string;
  /** Rels declared for this target, in declaration order. Never empty. */
  rels: string[];
};

/** A record that still holds, pointing at one that does not. */
export type KbStaleReference = {
  from: string;
  target: string;
  /** Always `superseded` or `rejected` — the standings that stopped holding. */
  targetStanding: Extract<KbStanding, "superseded" | "rejected">;
  rels: string[];
  /** The replacement chain, nearest first, limited to ids the bundle holds. */
  replacedBy: string[];
};

/** A record that still holds, pointing at the record being reassessed. */
export type KbLiveReference = {
  from: string;
  title: string | null;
  standing: KbStanding;
  rels: string[];
};
