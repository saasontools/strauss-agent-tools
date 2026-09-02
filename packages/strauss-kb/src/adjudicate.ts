import type { KbAnchorDriftEntry } from "./anchor-resolver.js";
import type { KbRecord, KbRecordStatus } from "./kb-record.schema.js";

/**
 * Why a matched record must not be read as a plain answer.
 *
 * Relevance and standing are different questions, and ranking answers only the
 * first. A superseded record is usually the older, longer, more general one and
 * its replacement is usually a narrowing, so any similarity measure favours the
 * record that is no longer true. Every hit therefore carries its standing, and
 * the caller is never handed a bare match.
 */
export type KbWarning =
  /** Explicitly not adopted. The most dangerous status to return unmarked: a
   *  well-formed assertion of what someone decided *not* to do. */
  | { kind: "rejected" }
  | { kind: "superseded"; by: string[] }
  /** Not settled. Acting on a proposal as though it were a decision is a defect. */
  | { kind: "unsettled"; status: KbRecordStatus }
  /** Says a matter is unresolved. Valuable as a result, never as an answer. */
  | { kind: "unresolved-question" }
  /** `strauss_superseded_by` names a record that is not in the bundle. */
  | { kind: "broken-chain"; missing: string }
  | { kind: "chain-cycle"; through: string[] }
  /** Two records claim to replace this one; picking either would be a guess. */
  | { kind: "forked-chain"; heads: string[] }
  | { kind: "stale"; staleAfter: string }
  | { kind: "unverified" }
  /** The code this record anchors to has changed since its hash was recorded —
   *  the record may describe code that no longer exists in that form. */
  | {
      kind: "drifted";
      anchors: {
        file: string;
        symbol?: string;
        /** `null` when the anchor recorded no line count — size unknown. */
        diffSize: number | null;
        reason?: string;
      }[];
    };

export type KbStanding =
  "current" | "superseded" | "rejected" | "unsettled" | "open";

export type KbAdjudicated = {
  record: KbRecord;
  standing: KbStanding;
  /** Where the supersession chain ends. Empty when it is broken or cyclic. */
  heads: KbRecord[];
  warnings: KbWarning[];
};

const STANDING: Record<KbRecordStatus, KbStanding> = {
  accepted: "current",
  resolved: "current",
  draft: "unsettled",
  proposed: "unsettled",
  open: "open",
  rejected: "rejected",
  superseded: "superseded",
};

/**
 * Attaches standing to records a search returned.
 *
 * Adjudicating rather than filtering, deliberately. A filtered result set is
 * invisible: the caller cannot tell it missed anything, so a dropped record is
 * worse than a flagged one — it turns a knowable gap into an unknowable one.
 */
export function adjudicate(
  hits: KbRecord[],
  bundle: KbRecord[],
  now = new Date(),
  // Precomputed by the caller: this function stays pure and sync, and the fs
  // work of re-resolving anchors lives in detectAnchorDrift.
  anchorDrift?: Map<string, KbAnchorDriftEntry[]>,
): KbAdjudicated[] {
  const byId = new Map(bundle.map((record) => [record.conceptId, record]));
  return hits.map((record) => {
    const status = record.frontmatter.strauss_status;
    const warnings: KbWarning[] = [];
    let heads: KbRecord[] = [];

    if (status === "superseded") {
      const resolved = resolveHeads(record, byId);
      heads = resolved.heads;
      warnings.push(...resolved.warnings);
      if (heads.length) {
        warnings.push({
          kind: "superseded",
          by: heads.map((head) => head.conceptId),
        });
      }
    } else if (status === "rejected") {
      warnings.push({ kind: "rejected" });
    } else if (status === "draft" || status === "proposed") {
      warnings.push({ kind: "unsettled", status });
    } else if (status === "open") {
      warnings.push({ kind: "unresolved-question" });
    }

    const staleAfter = record.frontmatter.stale_after;
    if (staleAfter && Date.parse(staleAfter) < now.getTime()) {
      warnings.push({ kind: "stale", staleAfter });
    }
    if (!record.frontmatter.verified?.length) {
      warnings.push({ kind: "unverified" });
    }

    // `foreign-repo` is not a finding: the anchor names a repository this root
    // is not, which a base describing several repositories does by design.
    // Filtered at the one point every read path and `doctor` share, so none of
    // them can start reporting it as decay.
    const moved = (anchorDrift?.get(record.conceptId) ?? []).filter(
      (entry) => entry.state !== "match" && entry.reason !== "foreign-repo",
    );
    if (moved.length) {
      warnings.push({
        kind: "drifted",
        anchors: moved.map(({ file, symbol, diffSize, reason }) => ({
          file,
          ...(symbol !== undefined ? { symbol } : {}),
          diffSize,
          ...(reason !== undefined ? { reason } : {}),
        })),
      });
    }

    return { record, standing: STANDING[status], heads, warnings };
  });
}

/**
 * Walks a supersession chain to whatever currently stands in its place.
 *
 * Both directions are followed, not just `strauss_superseded_by`. `supersede()`
 * writes the pair, but a hand-edit can leave one side behind, and a walk that
 * trusts only the forward pointer would silently return a record that something
 * in the bundle openly claims to replace.
 *
 * Resolution happens here rather than being denormalised onto records at write
 * time: a stored head would have to be rewritten on every ancestor whenever a
 * chain grows, which is derived state that goes stale — the failure this design
 * keeps avoiding elsewhere.
 */
export function resolveHeads(
  from: KbRecord,
  byId: Map<string, KbRecord>,
): { heads: KbRecord[]; warnings: KbWarning[] } {
  const warnings: KbWarning[] = [];
  const heads = new Map<string, KbRecord>();
  const seen = new Set<string>([from.conceptId]);
  const queue: KbRecord[] = [from];

  while (queue.length) {
    const current = queue.shift() as KbRecord;
    const next = successors(current, byId);

    for (const missing of next.missing) {
      warnings.push({ kind: "broken-chain", missing });
    }
    if (!next.records.length) {
      if (current.conceptId !== from.conceptId)
        heads.set(current.conceptId, current);
      continue;
    }
    for (const record of next.records) {
      if (seen.has(record.conceptId)) {
        warnings.push({ kind: "chain-cycle", through: [...seen] });
        continue;
      }
      seen.add(record.conceptId);
      queue.push(record);
    }
  }

  if (heads.size > 1) {
    warnings.push({ kind: "forked-chain", heads: [...heads.keys()] });
  }
  return { heads: [...heads.values()], warnings };
}

function successors(
  record: KbRecord,
  byId: Map<string, KbRecord>,
): { records: KbRecord[]; missing: string[] } {
  const ids = new Set<string>();
  const forward = record.frontmatter.strauss_superseded_by;
  if (forward) ids.add(forward);
  for (const [id, candidate] of byId) {
    if (candidate.frontmatter.strauss_supersedes?.includes(record.conceptId)) {
      ids.add(id);
    }
  }

  const records: KbRecord[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const found = byId.get(id);
    if (found) records.push(found);
    else missing.push(id);
  }
  return { records, missing };
}
