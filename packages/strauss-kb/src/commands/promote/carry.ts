import type {
  KbLink,
  KbRecord,
  KbRecordFrontmatter,
  KbRecordStatus,
} from "../../kb-record.schema.js";
import { isKbLinkRel, LINK_RELS } from "../../record-types.js";
import type { KbDroppedLink } from "./model.js";

/** The source entry a promotion adds, replaced rather than repeated on re-promote. */
export const PROMOTION_SOURCE_ID = "promoted";

/**
 * The status a copy is written under: settling is what promotion means, so the
 * unsettled statuses land `accepted` while `open` and `resolved` carry
 * unchanged. `rejected` and `superseded` never reach here — `promote` refuses
 * them.
 */
const CARRIED_STATUS: Record<KbRecordStatus, KbRecordStatus> = {
  draft: "accepted",
  proposed: "accepted",
  accepted: "accepted",
  open: "open",
  resolved: "resolved",
  rejected: "rejected",
  superseded: "superseded",
};

export type KbCarriedRecord = {
  frontmatter: Omit<KbRecordFrontmatter, "type">;
  body: string;
  droppedLinks: KbDroppedLink[];
};

/**
 * One record as the target base should hold it.
 *
 * Frontmatter is carried rather than recomposed: OKF requires a consumer to
 * preserve keys it does not recognise when round-tripping, and a record written
 * by another producer would lose them to a rebuild from known fields.
 */
export function carry(
  record: KbRecord,
  promoted: ReadonlySet<string>,
  source?: string,
): KbCarriedRecord {
  const {
    type: _type,
    // Both name records in the source base, and supersession in the target is
    // a separate question from whether this record belongs there at all.
    strauss_supersedes: _supersedes,
    strauss_superseded_by: _supersededBy,
    // A check run against the source repository, which the target never saw.
    verified: _verified,
    ...rest
  } = record.frontmatter;

  const links = rest.strauss_links ?? [];
  const kept = links.filter((link) => promoted.has(link.target));
  const dropped = links.filter((link) => !promoted.has(link.target));
  const tags = (rest.tags ?? []).filter((tag) => !isReviewTag(tag));

  const frontmatter: Omit<KbRecordFrontmatter, "type"> = {
    ...rest,
    strauss_status: CARRIED_STATUS[rest.strauss_status],
  };
  setOrDrop(frontmatter, "tags", tags);
  setOrDrop(frontmatter, "strauss_links", kept);

  let body = withoutLinkSentences(record.body, dropped);
  if (source) {
    frontmatter.sources = [
      ...(rest.sources ?? []).filter(
        (entry) => entry.id !== PROMOTION_SOURCE_ID,
      ),
      { id: PROMOTION_SOURCE_ID, resource: source },
    ];
    body = `${stripFootnote(body).trimEnd()}\n\n[^${PROMOTION_SOURCE_ID}]: ${source}\n`;
  }

  return {
    frontmatter,
    body,
    droppedLinks: dropped.map(({ target, rel }) => ({ target, rel })),
  };
}

/**
 * `review` and the `review:<id>` family alike: the target base is not a review
 * base, so a tag saying which review wrote the record no longer selects
 * anything there.
 */
export function isReviewTag(tag: string): boolean {
  return tag === "review" || tag.startsWith("review:");
}

/**
 * Removes the prose `compose.ts` renders for a link, alongside the link itself.
 * A body claiming an edge the frontmatter dropped is the one inconsistency the
 * two-place spelling of an edge can produce.
 */
function withoutLinkSentences(body: string, dropped: KbLink[]): string {
  const sentences = new Set(
    dropped
      .filter((link) => isKbLinkRel(link.rel))
      .map(
        (link) =>
          `${LINK_RELS[link.rel as keyof typeof LINK_RELS].phrase} [${link.target}](${link.target}.md).`,
      ),
  );
  if (!sentences.size) return body;
  return body
    .split("\n\n")
    .filter((block) => !sentences.has(block.trim()))
    .join("\n\n");
}

/** The footnote a previous promotion left, so re-promoting does not stack them. */
function stripFootnote(body: string): string {
  return body
    .split("\n")
    .filter((line) => !line.startsWith(`[^${PROMOTION_SOURCE_ID}]: `))
    .join("\n");
}

function setOrDrop<Key extends "tags" | "strauss_links">(
  frontmatter: Omit<KbRecordFrontmatter, "type">,
  key: Key,
  value: NonNullable<KbRecordFrontmatter[Key]>,
): void {
  if (value.length) frontmatter[key] = value;
  else delete frontmatter[key];
}
