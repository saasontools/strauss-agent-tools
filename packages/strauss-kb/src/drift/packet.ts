import type { KbStanding } from "../adjudicate.js";
import type {
  KbAnchorDriftEntry,
  KbDriftClass,
  KbDriftMovedTo,
} from "../anchor-resolver/index.js";
import type { KbRecord, KbRecordType } from "../kb-record.schema.js";
import type { KbImpactResult } from "../kb-links/index.js";
import { isKbRecordType, RECORD_TYPES } from "../record-types.js";
import {
  classifyDrift,
  type ClassifiedAnchor,
  type ClassifyOptions,
} from "./classify.js";
import { diffBudget, unifiedDiff } from "./diff.js";

/**
 * What a reader needs in order to decide whether a record still holds, without
 * opening the repository.
 *
 * A drift finding today says two hashes disagree, which is not a thing anyone
 * can judge. The packet is the same finding with the three pieces judgment
 * actually takes: what the record claims, what the code did, and what depends
 * on the answer. It stops there — the reading itself is the reader's, and
 * every default below is a starting point the protocol expects to be argued
 * with.
 */

export type KbReassessDiff =
  | {
      status: "ok";
      /** `ref` when the anchor pinned one, `history` when it was inferred. */
      source: "ref" | "history";
      /** The rev the old side was read at. */
      ref: string;
      unified: string;
      added: number;
      removed: number;
      truncated: boolean;
    }
  /** No committed text to diff against; see `readOldSource`. */
  | { status: "unrecoverable" };

export type KbReassessAnchor = {
  file: string;
  symbol?: string;
  class: KbDriftClass;
  reason?: string;
  storedHash: string;
  currentHash?: string;
  diffSize: number | null;
  movedTo?: KbDriftMovedTo;
  diff?: KbReassessDiff;
};

/**
 * What the type says about a record whose code changed under it.
 *
 * A `fact` is a claim about the world that the code was the evidence for, so
 * changed evidence presumptively unmakes it. A `decision` is a claim about a
 * choice, and the reasoning for a choice routinely outlives the code that
 * implemented it. Neither is a verdict — they are which way to lean while
 * reading, and naming the lean is what keeps it arguable.
 */
export type KbReassessDefault =
  "presumed-invalidated" | "rationale-may-survive" | "review";

const PRESUMED_INVALID: readonly KbRecordType[] = [
  "fact",
  "constraint",
  "contract",
];
const RATIONALE_SURVIVES: readonly KbRecordType[] = ["decision", "risk"];

const DEFAULT_NOTES: Record<KbReassessDefault, string> = {
  "presumed-invalidated":
    "the code this claim was taken from changed; presume it no longer holds until re-read",
  "rationale-may-survive":
    "the reasoning may outlive the code that implemented it; check whether it does",
  review: "re-read the record against the new code",
};

export type KbReassessPacket = {
  conceptId: string;
  title: string | null;
  type: string;
  standing: KbStanding;
  /** What breaks if this record is wrong — the record's `why`, stored as `description`. */
  why: string | null;
  /** The type's claim section — the sentence being reassessed. */
  claim: { section: string; text: string } | null;
  anchors: KbReassessAnchor[];
  /**
   * The record's dependants. A fact that stopped holding did not stop holding
   * alone, and a reader deciding about it is deciding about these too.
   */
  impact: {
    conceptId: string;
    title: string | null;
    standing: KbStanding;
    depth: number;
  }[];
  impactTruncated: boolean;
  default: KbReassessDefault;
  defaultNote: string;
};

export type PacketOptions = ClassifyOptions & {
  /** Recover and render the old-vs-new span diff. Off by default: it reads git. */
  withDiff?: boolean;
  impact?: KbImpactResult;
  standing?: KbStanding;
};

/**
 * One record's packet, or `null` when nothing survived classification.
 *
 * A record whose every drifted anchor turned out to be `moved` or `cosmetic`
 * is a record with no reassessment work, and emitting an empty packet for it
 * would put it back in front of the reader the classification just cleared it
 * from.
 */
export async function reassessPacket(
  repoRoot: string,
  record: KbRecord,
  entries: readonly KbAnchorDriftEntry[],
  options: PacketOptions = {},
): Promise<{
  packet: KbReassessPacket | null;
  classified: ClassifiedAnchor[];
}> {
  const classified = await classifyDrift(repoRoot, record, entries, {
    ...(options.reader ? { reader: options.reader } : {}),
    ...(options.search ? { search: options.search } : {}),
    withHistory: options.withDiff !== false,
  });

  const open = classified.filter(
    (found) => found.class === "changed" || found.class === "gone",
  );
  if (!open.length) return { packet: null, classified };

  const budget = diffBudget(open.length);
  const anchors = open.map((found) =>
    anchorPacket(found, options.withDiff === true, budget),
  );

  const type = record.frontmatter.type;
  const fallback: KbReassessDefault = isKbRecordType(type)
    ? PRESUMED_INVALID.includes(type)
      ? "presumed-invalidated"
      : RATIONALE_SURVIVES.includes(type)
        ? "rationale-may-survive"
        : "review"
    : "review";

  return {
    classified,
    packet: {
      conceptId: record.conceptId,
      title: record.frontmatter.title ?? null,
      type,
      standing: options.standing ?? "unsettled",
      why: record.frontmatter.description ?? null,
      claim: claimOf(record),
      anchors,
      impact: (options.impact?.impacted ?? []).map((entry) => ({
        conceptId: entry.conceptId,
        title: entry.title,
        standing: entry.standing,
        depth: entry.depth,
      })),
      impactTruncated: options.impact?.truncated ?? false,
      default: fallback,
      defaultNote: DEFAULT_NOTES[fallback],
    },
  };
}

function anchorPacket(
  found: ClassifiedAnchor,
  withDiff: boolean,
  maxLines: number,
): KbReassessAnchor {
  const { entry } = found;
  const base: KbReassessAnchor = {
    file: entry.file,
    ...(entry.symbol ? { symbol: entry.symbol } : {}),
    class: found.class,
    ...(entry.reason ? { reason: entry.reason } : {}),
    storedHash: entry.storedHash,
    ...(entry.currentHash ? { currentHash: entry.currentHash } : {}),
    diffSize: entry.diffSize,
    ...(entry.movedTo ? { movedTo: entry.movedTo } : {}),
  };
  if (!withDiff) return base;

  if (found.oldText === undefined || !found.oldOrigin) {
    return { ...base, diff: { status: "unrecoverable" } };
  }
  // A `gone` anchor has no new side; the diff is the whole old span removed,
  // which is exactly what the reader has to weigh.
  const rendered = unifiedDiff(found.oldText, found.newText ?? "", {
    maxLines,
  });
  return {
    ...base,
    diff: {
      status: "ok",
      source: found.oldOrigin.kind,
      ref: found.oldOrigin.ref,
      unified: rendered.text,
      added: rendered.added,
      removed: rendered.removed,
      truncated: rendered.truncated,
    },
  };
}

/**
 * The first section of the record's type — its central claim, per the type
 * table — pulled out of the body so the packet carries the sentence being
 * judged rather than the whole record.
 */
function claimOf(record: KbRecord): { section: string; text: string } | null {
  const type = record.frontmatter.type;
  const section = isKbRecordType(type)
    ? RECORD_TYPES[type].sections[0]
    : undefined;
  if (!section) return null;

  const lines = record.body.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex(
    (line) => line.trim().toLowerCase() === `## ${section}`.toLowerCase(),
  );
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  const text = (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
  return text ? { section, text } : null;
}
