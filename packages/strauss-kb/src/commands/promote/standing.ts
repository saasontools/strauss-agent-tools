import { adjudicate, type KbStanding } from "../../adjudicate.js";
import type { KbRecord } from "../../kb-record.schema.js";

/**
 * Standings a promotion neither lists nor carries: the record has been withdrawn
 * where it was written, and the target base holds no chain that says so.
 */
const WITHDRAWN: readonly KbStanding[] = ["superseded", "rejected"];

/** Adjudicated standing per concept id, over the whole source base. */
export function standings(bundle: KbRecord[]): Map<string, KbStanding> {
  return new Map(
    adjudicate(bundle, bundle).map((hit) => [
      hit.record.conceptId,
      hit.standing,
    ]),
  );
}

export function isWithdrawn(standing: KbStanding | undefined): boolean {
  return standing !== undefined && WITHDRAWN.includes(standing);
}
