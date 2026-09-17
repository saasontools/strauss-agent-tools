import type { KbStanding } from "../adjudicate.js";
import type { KbRecord } from "../kb-record.schema.js";
import type { KbLiveReference, KbStaleReference } from "./model.js";
import { outboundReferences } from "./outbound.js";

/**
 * A record that still holds, pointing at one that no longer does — superseded
 * or rejected alike. One finding per source/target pair, however many ways the
 * pair is stated, and every finding asks for a reading, never a write.
 */

/** Standings whose records are out of force and stay out of both directions. */
function outOfForce(standing: KbStanding | undefined): boolean {
  return standing === "superseded" || standing === "rejected";
}

/**
 * Every stale reference in the bundle, in bundle order, then in each record's
 * own reference order.
 */
export function staleReferences(
  bundle: KbRecord[],
  standings: Map<string, KbStanding>,
): KbStaleReference[] {
  const byId = new Map(bundle.map((record) => [record.conceptId, record]));
  return bundle.flatMap((record) =>
    staleReferencesFrom(record, byId, standings),
  );
}

/**
 * One record's stale references.
 *
 * A record already out of force is asked nothing: what a superseded record
 * points at is history, and repairing it would put a finding on every record
 * the base has already replaced.
 */
export function staleReferencesFrom(
  record: KbRecord,
  byId: Map<string, KbRecord>,
  standings: Map<string, KbStanding>,
): KbStaleReference[] {
  if (outOfForce(standings.get(record.conceptId))) return [];

  const findings: KbStaleReference[] = [];
  for (const reference of outboundReferences(record)) {
    const target = byId.get(reference.target);
    // A target that is not here at all is `validate`'s finding, not this one:
    // there is no standing to read, so there is nothing to say about force.
    if (!target) continue;
    const standing = standings.get(reference.target);
    if (!outOfForce(standing)) continue;
    // The history working as designed: a replacement names what it replaced,
    // which `relatedConceptIds` on a superseding write renders as exactly this
    // edge. Reporting it would put a finding on every correct supersession.
    if (replaces(record, target)) continue;
    findings.push({
      from: record.conceptId,
      target: reference.target,
      targetStanding: standing as "superseded" | "rejected",
      rels: reference.rels,
      replacedBy: replacementChain(target, byId),
    });
  }
  return findings;
}

/**
 * Who still points at this record, among the records that still hold.
 *
 * The inverse question, asked of a record that has stopped holding: a reader
 * deciding what its replacement means needs the open risks and questions that
 * were leaning on it. Contextual by design — it is one hop and every rel,
 * where `kb_impact` walks causal dependence transitively.
 */
export function liveReferencesTo(
  targetId: string,
  bundle: KbRecord[],
  standings: Map<string, KbStanding>,
): KbLiveReference[] {
  const target = bundle.find((record) => record.conceptId === targetId);
  const rows: KbLiveReference[] = [];
  for (const record of bundle) {
    if (record.conceptId === targetId) continue;
    if (outOfForce(standings.get(record.conceptId))) continue;
    if (target && replaces(record, target)) continue;
    const reference = outboundReferences(record).find(
      (entry) => entry.target === targetId,
    );
    if (!reference) continue;
    rows.push({
      from: record.conceptId,
      title: record.frontmatter.title ?? null,
      standing: standings.get(record.conceptId) ?? "unsettled",
      rels: reference.rels,
    });
  }
  return rows;
}

/**
 * The replacement chain from a superseded record, nearest first, stopping at
 * the first id the bundle does not hold.
 *
 * Bounded by the ids already seen: a cyclic chain is `doctor`'s
 * `broken-supersession` finding, and this walk must not hang on one.
 */
function replacementChain(
  target: KbRecord,
  byId: Map<string, KbRecord>,
): string[] {
  const chain: string[] = [];
  const seen = new Set([target.conceptId]);
  let next = target.frontmatter.strauss_superseded_by;
  while (next && !seen.has(next)) {
    const record = byId.get(next);
    if (!record) break;
    chain.push(next);
    seen.add(next);
    next = record.frontmatter.strauss_superseded_by;
  }
  return chain;
}

/** Either pointer saying `later` is what stands in `earlier`'s place. */
function replaces(later: KbRecord, earlier: KbRecord): boolean {
  return (
    (later.frontmatter.strauss_supersedes ?? []).includes(earlier.conceptId) ||
    earlier.frontmatter.strauss_superseded_by === later.conceptId
  );
}
