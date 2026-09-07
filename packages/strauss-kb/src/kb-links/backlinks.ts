import { adjudicate } from "../adjudicate.js";
import { KbRecordNotFoundError } from "../kb-errors.js";
import type { KbRecord } from "../kb-record.schema.js";
import { recordSummary } from "../record-summary.js";
import { inboundIndex } from "./inbound.js";
import type { KbBacklink, KbBacklinksResult } from "./model.js";

/**
 * Every edge the bundle holds against this id: one hop, every rel including
 * `related_to`, each row carrying the standing of the record that made it.
 * Flat and factual, where `impact` answers the causal, transitive question.
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
      ...recordSummary(record),
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
