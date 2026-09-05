import { isNoDecisionRecord } from "../../decision-record.js";
import { inboundIndex } from "../../kb-links/index.js";
import type { KbInboundEdge } from "../../kb-links/index.js";
import type { KbRecord, KbRecordStatus } from "../../kb-record.schema.js";
import type { KbPromoteCandidate } from "./model.js";
import { isWithdrawn, standings } from "./standing.js";

/**
 * The bare tag, not the `review:<id>` family. `review` says the record is still
 * under review; `review:pr-59` only says which review wrote it, and every
 * record in a review base carries one.
 */
const REVIEW_TAG = "review";

/** A risk nobody has to carry forward. */
const SETTLED: readonly KbRecordStatus[] = ["resolved"];

/**
 * What in a review base is worth keeping once the change merges. Heuristics over
 * what a reviewer usually wants; a record they cut is still nameable by hand.
 * A withdrawn record is not among them — `promote` refuses those outright.
 */
export function promoteCandidates(bundle: KbRecord[]): KbPromoteCandidate[] {
  const inbound = inboundIndex(bundle);
  const standing = standings(bundle);
  const rows: KbPromoteCandidate[] = [];

  for (const record of bundle) {
    if (isWithdrawn(standing.get(record.conceptId))) continue;
    const why = candidateReason(record, inbound.get(record.conceptId) ?? []);
    if (!why) continue;
    rows.push({
      conceptId: record.conceptId,
      type: recordType(record.conceptId),
      title: record.frontmatter.title ?? null,
      why,
    });
  }
  return rows;
}

function candidateReason(
  record: KbRecord,
  inbound: KbInboundEdge[],
): string | null {
  const { strauss_status: status, tags } = record.frontmatter;

  switch (recordType(record.conceptId)) {
    case "decision":
      if (isNoDecisionRecord(record)) return null;
      return tags?.includes(REVIEW_TAG)
        ? null
        : "decision no longer under review";
    case "constraint":
      return status === "proposed"
        ? "constraint still proposed — the target base is where it settles"
        : null;
    case "contract":
      return "contract — it outlives the change that introduced it";
    case "requirement":
      return inbound.some((edge) => edge.rel === "satisfies")
        ? "requirement something in the base satisfies"
        : null;
    case "risk":
      return record.frontmatter.strauss_materiality === "blocking" &&
        !SETTLED.includes(status)
        ? "blocking risk still open"
        : null;
    default:
      return null;
  }
}

function recordType(conceptId: string): string {
  return conceptId.slice(0, conceptId.indexOf("."));
}
