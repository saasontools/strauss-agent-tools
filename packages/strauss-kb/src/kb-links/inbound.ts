import type { KbRecord } from "../kb-record.schema.js";
import type { KbInboundEdge } from "./model.js";

/**
 * The whole bundle's typed edges, indexed by target.
 *
 * Built once per call rather than per hop: a walk that re-scanned every
 * record's `strauss_links` at each step would be quadratic in the bundle for a
 * question whose answer is usually a handful of records.
 *
 * Order is the bundle's own — `list()` returns records sorted by filename — and
 * then each record's links in the order it declared them, so two runs over an
 * unchanged base produce the same answer in the same order.
 */
export function inboundIndex(bundle: KbRecord[]): Map<string, KbInboundEdge[]> {
  const byTarget = new Map<string, KbInboundEdge[]>();

  for (const record of bundle) {
    for (const link of record.frontmatter.strauss_links ?? []) {
      // A record naming itself is a no-op, not an error, for the same reason
      // `supersedes` treats it that way: the claim is already true.
      if (link.target === record.conceptId) continue;

      const edges = byTarget.get(link.target) ?? [];
      // The same pair stated twice says nothing twice.
      if (
        edges.some(
          (edge) => edge.from === record.conceptId && edge.rel === link.rel,
        )
      ) {
        continue;
      }
      edges.push({ from: record.conceptId, rel: link.rel });
      byTarget.set(link.target, edges);
    }
  }

  return byTarget;
}
