import type { KbRecord } from "./kb-record.schema.js";
import { KB_LINK_RELS } from "./record-types.js";

/**
 * The edges between records in one bundle, defined once for `trace` and
 * `pack`. `typed-link` (`strauss_links`) is directed and the only edge a
 * record declares; the other three are symmetric. Prose is never walked; the
 * inbound half of a typed edge is `kb-links/`.
 */
export const KB_EDGE_KINDS = [
  "typed-link",
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

/**
 * Which rels a `typed-link` walk may follow.
 *
 * Defaults to the whole known vocabulary — including `related_to`, since a
 * neighbourhood is the one place a bibliography belongs. It never includes an
 * unknown rel: a rel outside the vocabulary is not a claim any walk can
 * interpret, so no walk traverses it anywhere, and `kb_validate` reports it as
 * an error rather than a walk quietly acting on it.
 */
export const DEFAULT_TYPED_LINK_RELS: readonly string[] = KB_LINK_RELS;

/**
 * Every record `from` touches, each carrying the full set of edge kinds that
 * connect the pair. Order is deterministic: bundle order per kind, kinds in
 * the order given.
 */
export function neighbours(
  from: KbRecord,
  bundle: KbRecord[],
  kinds: readonly KbEdgeKind[] = KB_EDGE_KINDS,
  linkRels: readonly string[] = DEFAULT_TYPED_LINK_RELS,
): KbNeighbour[] {
  const found = new Map<string, KbNeighbour>();
  for (const kind of kinds) {
    for (const record of edgeNeighbours(from, bundle, kind, linkRels)) {
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

/**
 * The records one edge kind connects `from` to, in bundle order.
 *
 * `linkRels` narrows the `typed-link` kind and is ignored by the others —
 * `trace` passes the causal rels, `pack` takes the default.
 */
export function edgeNeighbours(
  from: KbRecord,
  bundle: KbRecord[],
  kind: KbEdgeKind,
  linkRels: readonly string[] = DEFAULT_TYPED_LINK_RELS,
): KbRecord[] {
  switch (kind) {
    // Outbound only. A missing target is skipped (`kb_validate` warns), and so
    // is a rel outside `linkRels`, which keeps an unknown rel untraversable
    // everywhere.
    case "typed-link": {
      const allowed = new Set(linkRels);
      const targets = new Set(
        (from.frontmatter.strauss_links ?? [])
          .filter((link) => allowed.has(link.rel))
          .map((link) => link.target),
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
