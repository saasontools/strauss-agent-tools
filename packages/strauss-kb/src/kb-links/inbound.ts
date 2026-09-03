import type { KbRecord } from "../kb-record.schema.js";
import type { KbInboundEdge } from "./model.js";

/**
 * The whole bundle's typed edges, indexed by target — built once per call, so a
 * walk stays linear in the bundle rather than quadratic. Order is `list()`'s
 * own, then each record's declared link order, so repeated runs agree.
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
