import type { KbRecord } from "../kb-record.schema.js";
import { isKbLinkRel } from "../record-types.js";
import type { KbOutboundReference } from "./model.js";

/**
 * Every record this one explicitly points at, each target once.
 *
 * Two rels between one pair are two claims and both are kept; the same rel
 * stated twice says nothing twice. A rel outside the closed vocabulary is
 * skipped, as every walk skips it. Shared anchors and sources are co-location,
 * not reference.
 */
export function outboundReferences(record: KbRecord): KbOutboundReference[] {
  const byTarget = new Map<string, KbOutboundReference>();
  for (const link of record.frontmatter.strauss_links ?? []) {
    if (link.target === record.conceptId || !isKbLinkRel(link.rel)) continue;
    const found = byTarget.get(link.target);
    if (!found) {
      byTarget.set(link.target, { target: link.target, rels: [link.rel] });
      continue;
    }
    if (!found.rels.includes(link.rel)) found.rels.push(link.rel);
  }
  return [...byTarget.values()];
}
