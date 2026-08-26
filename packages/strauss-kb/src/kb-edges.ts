import {
  KB_CONCEPT_ID_PATTERN,
  type KbRecord,
} from "./kb-record.schema.js";

/**
 * The edges between records in one bundle, defined once.
 *
 * Both walks — `trace` and `pack` — consume this module, so they cannot drift
 * into disagreeing about what makes two records neighbours, and a diagnostic
 * pass over the graph can reuse the same definition.
 *
 * There is no separate `related` kind: compose.ts renders `relatedConceptIds`
 * as body links (`Relates to [id](id.md).`), so in stored form a related edge
 * IS a body link, and a distinct kind would count the same markdown twice.
 */
export const KB_EDGE_KINDS = [
  "body-link",
  "supersession",
  "anchor",
  "source",
] as const;

export type KbEdgeKind = (typeof KB_EDGE_KINDS)[number];

export type KbNeighbour = {
  record: KbRecord;
  /** Every edge kind that connects it to the record asked about. */
  via: KbEdgeKind[];
};

// The target of any markdown link whose href is a record filename:
// `](<concept-id>.md)`. Built from the id pattern with its anchors stripped so
// the id can be matched mid-body.
const BODY_LINK_TARGET = new RegExp(
  `\\]\\((${KB_CONCEPT_ID_PATTERN.source.replace(/^\^|\$$/g, "")})\\.md\\)`,
  "g",
);

/**
 * Every record `from` touches, each carrying the full set of edge kinds that
 * connect the pair. Order is deterministic: bundle order per kind, kinds in
 * the order given.
 */
export function neighbours(
  from: KbRecord,
  bundle: KbRecord[],
  kinds: readonly KbEdgeKind[] = KB_EDGE_KINDS,
): KbNeighbour[] {
  const found = new Map<string, KbNeighbour>();
  for (const kind of kinds) {
    for (const record of edgeNeighbours(from, bundle, kind)) {
      const existing = found.get(record.conceptId);
      if (existing) {
        if (!existing.via.includes(kind)) existing.via.push(kind);
        continue;
      }
      found.set(record.conceptId, { record, via: [kind] });
    }
  }
  return [...found.values()];
}

/** The records one edge kind connects `from` to, in bundle order. */
export function edgeNeighbours(
  from: KbRecord,
  bundle: KbRecord[],
  kind: KbEdgeKind,
): KbRecord[] {
  switch (kind) {
    // A link whose target is not in the bundle is legal per compose.ts —
    // records are routinely written before the ones they point at exist — so
    // missing targets are skipped, never an error.
    case "body-link": {
      const targets = new Set(
        [...from.body.matchAll(BODY_LINK_TARGET)].map((match) => match[1]),
      );
      if (!targets.size) return [];
      return bundle.filter(
        (candidate) =>
          candidate.conceptId !== from.conceptId &&
          targets.has(candidate.conceptId),
      );
    }

    // Both directions and both pointers: `supersede()` writes the pair, but a
    // hand-edit can leave one side behind, and a walk trusting one pointer
    // would miss a replacement the bundle openly declares.
    case "supersession":
      return bundle.filter(
        (candidate) =>
          candidate.conceptId !== from.conceptId &&
          (candidate.conceptId === from.frontmatter.strauss_superseded_by ||
            from.frontmatter.strauss_supersedes?.includes(
              candidate.conceptId,
            ) ||
            candidate.frontmatter.strauss_superseded_by === from.conceptId ||
            candidate.frontmatter.strauss_supersedes?.includes(from.conceptId)),
      );

    // The edge that answers "why is this code shaped this way": every record
    // attached to the same file or symbol, whatever its standing.
    case "anchor": {
      const mine = from.frontmatter.strauss_anchors ?? [];
      if (!mine.length) return [];
      return bundle.filter(
        (candidate) =>
          candidate.conceptId !== from.conceptId &&
          (candidate.frontmatter.strauss_anchors ?? []).some((theirs) =>
            mine.some((ours) => anchorsTouch(ours, theirs)),
          ),
      );
    }

    case "source": {
      const mine = new Set((from.frontmatter.sources ?? []).map((s) => s.id));
      if (!mine.size) return [];
      return bundle.filter(
        (candidate) =>
          candidate.conceptId !== from.conceptId &&
          (candidate.frontmatter.sources ?? []).some((source) =>
            mine.has(source.id),
          ),
      );
    }
  }
}

/**
 * Two anchors touch when they name the same file and do not name different
 * symbols within it.
 *
 * An anchor without a symbol means "this record is about this file", so it
 * relates to everything anchored inside it. Requiring an exact match instead
 * would hide the file-level record from every symbol-level walk, which is the
 * direction a reviewer actually reads.
 */
function anchorsTouch(
  left: { file: string; symbol?: string },
  right: { file: string; symbol?: string },
): boolean {
  if (left.file !== right.file) return false;
  if (!left.symbol || !right.symbol) return true;
  return left.symbol === right.symbol;
}
