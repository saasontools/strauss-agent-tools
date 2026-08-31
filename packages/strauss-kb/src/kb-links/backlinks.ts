import { adjudicate } from "../adjudicate.js";
import { KbRecordNotFoundError } from "../kb-errors.js";
import type { KbRecord } from "../kb-record.schema.js";
import { inboundIndex } from "./inbound.js";
import type { KbBacklink, KbBacklinksResult } from "./model.js";

/**
 * Who points at this record, one hop, every rel.
 *
 * The flat counterpart to `impact`, and separate from it on purpose. `impact`
 * answers a causal question and takes positions to answer it — which rels
 * propagate, where a withdrawn record stops the walk. This answers a factual
 * one: these are the edges the bundle currently holds against this id. A flag
 * on `impact` would have made one call mean two things, and the transitive
 * answer is the more dangerous of the two to receive by accident.
 *
 * `related_to` is included here where `impact` excludes it. "Who mentions this"
 * is exactly what a flat listing is for.
 *
 * Standing still travels with each row. A backlink from a superseded record is
 * not a live dependency, and handing back a bare list of ids would present it
 * as one — the same failure adjudication exists to prevent everywhere else.
 */
export function backlinks(
  targetId: string,
  bundle: KbRecord[],
): KbBacklinksResult {
  const byId = new Map(bundle.map((record) => [record.conceptId, record]));
  if (!byId.has(targetId)) throw new KbRecordNotFoundError(targetId);

  const standingOf = new Map(
    adjudicate(bundle, bundle).map((hit) => [hit.record.conceptId, hit]),
  );

  const rows: KbBacklink[] = [];
  for (const edge of inboundIndex(bundle).get(targetId) ?? []) {
    const record = byId.get(edge.from);
    if (!record) continue;
    const hit = standingOf.get(edge.from);
    rows.push({
      ...edge,
      title: record.frontmatter.title ?? null,
      standing: hit?.standing ?? "unsettled",
      warnings: hit?.warnings ?? [],
    });
  }

  return {
    target: targetId,
    backlinks: rows.sort(
      (left, right) =>
        left.from.localeCompare(right.from) ||
        left.rel.localeCompare(right.rel),
    ),
  };
}
