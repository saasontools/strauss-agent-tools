import type {
  KbActorStamp,
  KbAnchor,
  KbLink,
  KbRecord,
  KbRecordStatus,
  KbSource,
} from "./kb-record.schema.js";

/**
 * A record's frontmatter as every read hands it over.
 *
 * One projection, used by `list`, `load`, `query`, `trace`, `match`,
 * `backlinks` and `impact`, because seven hand-written projections disagreed:
 * a consumer that needed `materiality` had to re-read the file the tool had
 * just parsed. Bodies stay with the verbs that carry them — this is
 * frontmatter only.
 */
export type KbRecordSummary = {
  type: string;
  title: string | null;
  description: string | null;
  status: KbRecordStatus;
  tags: string[];
  sources: KbSource[];
  anchors: KbAnchor[];
  strauss_links: KbLink[];
  verified: KbActorStamp[];
  /** `strauss_verify`: what a reader should re-run to check the claim. */
  verify: string[];
  materiality?: string;
  confidence?: string;
  owner?: string;
  /** True only where the record says so; an unsourced claim is an assumption. */
  assumption?: boolean;
  stale_after?: string;
};

/** Every field above, absent ones as empty rather than missing. */
export function recordSummary(record: KbRecord): KbRecordSummary {
  const front = record.frontmatter;
  return {
    type: front.type,
    title: front.title ?? null,
    description: front.description ?? null,
    status: front.strauss_status,
    tags: front.tags ?? [],
    sources: front.sources ?? [],
    anchors: front.strauss_anchors ?? [],
    strauss_links: front.strauss_links ?? [],
    verified: front.verified ?? [],
    verify: front.strauss_verify ?? [],
    // Scalars stay absent rather than null: each is a judgment the author
    // either made or did not, and a null would read as "none of the above".
    ...(front.strauss_materiality
      ? { materiality: front.strauss_materiality }
      : {}),
    ...(front.strauss_confidence
      ? { confidence: front.strauss_confidence }
      : {}),
    ...(front.strauss_owner ? { owner: front.strauss_owner } : {}),
    ...(front.strauss_assumption === undefined
      ? {}
      : { assumption: front.strauss_assumption }),
    ...(front.stale_after ? { stale_after: front.stale_after } : {}),
  };
}
