import { adjudicate, type KbAdjudicated } from "../adjudicate.js";
import { KbRecordNotFoundError } from "../kb-errors.js";
import type { KbRecord } from "../kb-record.schema.js";
import { KB_CAUSAL_LINK_RELS } from "../record-types.js";
import { inboundIndex } from "./inbound.js";
import type {
  KbImpactOptions,
  KbImpactResult,
  KbImpactedRecord,
  KbInboundEdge,
} from "./model.js";

/**
 * What breaks if this record changes.
 *
 * The inbound closure over typed causal edges. Every edge lives on its source
 * and reads source → target — `A depends_on B` means A needs B — so the
 * records at risk when B moves are the ones that declared a dependence on B,
 * then the ones that depend on those, and so on. Outbound is the record's own
 * `strauss_links`, which the record already carries; there is nothing to walk
 * for that.
 *
 * `related_to` is excluded by default. It exists precisely to say "worth
 * reading, no claim of dependence", and following it would turn a blast radius
 * into a bibliography.
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
 * shortest depth at which it was reached, and accumulates every inbound edge
 * that reached it, so a cycle terminates without losing a reason.
 */
export function impact(
  targetId: string,
  bundle: KbRecord[],
  options: KbImpactOptions = {},
): KbImpactResult {
  const byId = new Map(bundle.map((record) => [record.conceptId, record]));
  if (!byId.has(targetId)) throw new KbRecordNotFoundError(targetId);

  const rels = new Set(options.rels ?? KB_CAUSAL_LINK_RELS);
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

  for (let depth = 1; depth <= maxDepth && frontier.length; depth += 1) {
    const next: string[] = [];

    for (const id of frontier) {
      for (const edge of inbound.get(id) ?? []) {
        if (!rels.has(edge.rel)) continue;
        // The root is the question, not an answer to it.
        if (edge.from === targetId) continue;

        const existing = reached.get(edge.from);
        if (existing) {
          if (!hasEdge(existing.via, edge)) existing.via.push(edge);
          continue;
        }

        // An edge whose source is not in the bundle cannot happen — the index
        // is built from records — but an edge whose *target* is missing is
        // routine, and is why this walk never assumes a lookup succeeds.
        const record = byId.get(edge.from);
        if (!record) continue;

        const hit = standingOf.get(edge.from);
        const entry: KbImpactedRecord = {
          conceptId: edge.from,
          title: record.frontmatter.title ?? null,
          standing: hit?.standing ?? "unsettled",
          warnings: hit?.warnings ?? [],
          depth,
          via: [edge],
        };
        reached.set(edge.from, entry);

        if (entry.standing === "superseded" || entry.standing === "rejected") {
          stopped.push(edge.from);
          continue;
        }
        next.push(edge.from);
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
  };
}

function hasEdge(edges: KbInboundEdge[], edge: KbInboundEdge): boolean {
  return edges.some(
    (existing) => existing.from === edge.from && existing.rel === edge.rel,
  );
}
