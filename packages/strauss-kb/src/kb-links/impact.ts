import { adjudicate, type KbAdjudicated } from "../adjudicate.js";
import { KbRecordNotFoundError, KbUnknownLinkRelError } from "../kb-errors.js";
import type { KbRecord } from "../kb-record.schema.js";
import {
  isKbLinkRel,
  KB_CAUSAL_LINK_RELS,
  LINK_RELS,
} from "../record-types.js";
import { inboundIndex } from "./inbound.js";
import type {
  KbImpactOptions,
  KbImpactResult,
  KbImpactedRecord,
  KbLinkEdge,
} from "./model.js";

/**
 * What breaks if this record changes.
 *
 * The transitive set of *dependants*, which is not the same as the set of
 * inbound edges. Each rel says which of its two ends depends on the other, and
 * that end is not always the source: `A depends_on B` puts the dependant at
 * the source, so B's dependants include A and the walk runs against the edge;
 * `A informs B` puts it at the target, so A's dependants include B and the walk
 * runs along the edge. Following only inbound edges would report the blast
 * radius of `informs`, `blocks`, `invalidates` and `constrains` backwards —
 * naming the records that are safe and omitting the ones at risk.
 *
 * So each hop asks two questions of a record: who points at me with a rel whose
 * dependant is the source, and who do I point at with a rel whose dependant is
 * the target. Both answers are dependants; the walk recurses from each.
 *
 * `related_to` carries no dependant and so propagates nothing. An unknown rel
 * is never followed anywhere — it cannot be traversed by definition, and
 * `kb_validate` reports it as an error rather than a walk silently absorbing it.
 *
 * Standing is applied but nothing is filtered, which is this package's standing
 * rule everywhere: a dropped record turns a knowable gap into an unknowable
 * one. What standing does change is traversal — a superseded or rejected
 * record's own declared edges no longer hold, so the walk reports it and stops
 * there rather than propagating through a dependency that was withdrawn. Those
 * stopping points are named in `stopped`.
 *
 * Cycles are ordinary here rather than exceptional: `A depends_on B` and
 * `B constrains A` is a legitimate pair. A record is expanded once, keeps the
 * shortest depth at which it was reached, and accumulates every edge that
 * reached it, so a cycle terminates without losing a reason.
 */
export function impact(
  targetId: string,
  bundle: KbRecord[],
  options: KbImpactOptions = {},
): KbImpactResult {
  const byId = new Map(bundle.map((record) => [record.conceptId, record]));
  if (!byId.has(targetId)) throw new KbRecordNotFoundError(targetId);

  const rels = resolveRels(options.rels);
  const maxDepth = options.depth ?? Number.POSITIVE_INFINITY;
  const inbound = inboundIndex(bundle);

  // Adjudicated once over the whole bundle: standing must not depend on
  // whether a record's replacement happened to be within the walk.
  const standingOf = new Map<string, KbAdjudicated>(
    adjudicate(bundle, bundle).map((hit) => [hit.record.conceptId, hit]),
  );

  const reached = new Map<string, KbImpactedRecord>();
  const stopped: string[] = [];
  let frontier = [targetId];
  let depth = 0;

  while (frontier.length && depth < maxDepth) {
    depth += 1;
    const next: string[] = [];

    const consider = (dependantId: string, edge: KbLinkEdge) => {
      // The root is the question, not an answer to it.
      if (dependantId === targetId) return;

      const existing = reached.get(dependantId);
      if (existing) {
        if (!hasEdge(existing.via, edge)) existing.via.push(edge);
        return;
      }

      const record = byId.get(dependantId);
      // An edge naming a record that is not in the bundle is routine — records
      // are written before the ones they point at — and `kb_validate` is what
      // reports it. Nothing to report as impacted, so nothing is invented.
      if (!record) return;

      const hit = standingOf.get(dependantId);
      const entry: KbImpactedRecord = {
        conceptId: dependantId,
        title: record.frontmatter.title ?? null,
        standing: hit?.standing ?? "unsettled",
        warnings: hit?.warnings ?? [],
        depth,
        via: [edge],
      };
      reached.set(dependantId, entry);

      if (entry.standing === "superseded" || entry.standing === "rejected") {
        stopped.push(dependantId);
        return;
      }
      next.push(dependantId);
    };

    for (const id of frontier) {
      // Inbound: someone points at me with a rel whose dependant is the source.
      for (const edge of inbound.get(id) ?? []) {
        if (!rels.has(edge.rel)) continue;
        if (dependantEnd(edge.rel) !== "source") continue;
        consider(edge.from, { source: edge.from, target: id, rel: edge.rel });
      }

      // Outbound: I point at someone with a rel whose dependant is the target.
      for (const link of byId.get(id)?.frontmatter.strauss_links ?? []) {
        if (!rels.has(link.rel)) continue;
        if (dependantEnd(link.rel) !== "target") continue;
        if (link.target === id) continue;
        consider(link.target, {
          source: id,
          target: link.target,
          rel: link.rel,
        });
      }
    }

    frontier = next;
  }

  return {
    root: targetId,
    impacted: [...reached.values()].sort(
      (left, right) =>
        left.depth - right.depth ||
        left.conceptId.localeCompare(right.conceptId),
    ),
    stopped: stopped.sort(),
    truncated: frontier.length > 0,
    unexpanded: [...frontier].sort(),
  };
}

/**
 * The caller's `rels`, checked at the library boundary.
 *
 * A rel the walk cannot follow is an error, not an empty result: the two are
 * indistinguishable to a caller, and "nothing breaks" is the most dangerous
 * answer this function can return.
 */
function resolveRels(rels: readonly string[] | undefined): Set<string> {
  if (!rels?.length) return new Set<string>(KB_CAUSAL_LINK_RELS);
  for (const rel of rels) {
    if (!isKbLinkRel(rel) || LINK_RELS[rel].dependant === null) {
      throw new KbUnknownLinkRelError(rel, KB_CAUSAL_LINK_RELS);
    }
  }
  return new Set(rels);
}

/** Which end of a stored rel depends on the other. `null` for anything inert. */
function dependantEnd(rel: string): "source" | "target" | null {
  return isKbLinkRel(rel) ? LINK_RELS[rel].dependant : null;
}

function hasEdge(edges: KbLinkEdge[], edge: KbLinkEdge): boolean {
  return edges.some(
    (existing) =>
      existing.source === edge.source &&
      existing.target === edge.target &&
      existing.rel === edge.rel,
  );
}
