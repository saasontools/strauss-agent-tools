import { bodyLinkTargets } from "../kb-edges.js";
import type { KbRecord } from "../kb-record.schema.js";
import type { KbOutboundReference } from "./model.js";

/**
 * Every record this one explicitly points at, each target once.
 *
 * Both halves, deduplicated by target: a pair stated in the prose and in
 * `strauss_links` is one reference carrying both origins, not two findings for
 * one edit. Typed links come first and in declaration order, then the
 * body-only citations in the order the prose makes them, so two runs over the
 * same record agree.
 *
 * Shared anchors and shared sources are not references. Two records about the
 * same file are co-located, which is `kb-edges`' question; neither one cites
 * the other.
 */
export function outboundReferences(record: KbRecord): KbOutboundReference[] {
  const byTarget = new Map<string, KbOutboundReference>();

  for (const link of record.frontmatter.strauss_links ?? []) {
    if (link.target === record.conceptId) continue;
    const found = byTarget.get(link.target);
    if (!found) {
      byTarget.set(link.target, {
        target: link.target,
        origins: ["link"],
        rels: [link.rel],
      });
      continue;
    }
    // The same pair stated twice says nothing twice, but two rels between one
    // pair are two claims and both are kept.
    if (!found.rels.includes(link.rel)) found.rels.push(link.rel);
  }

  for (const target of bodyLinkTargets(record)) {
    const found = byTarget.get(target);
    if (found) {
      found.origins = ["body", "link"];
      continue;
    }
    byTarget.set(target, { target, origins: ["body"], rels: [] });
  }

  return [...byTarget.values()];
}
