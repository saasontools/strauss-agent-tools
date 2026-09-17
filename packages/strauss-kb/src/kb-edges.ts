import type { KbRecord } from "./kb-record.schema.js";
import { KB_LINK_RELS } from "./record-types.js";

/**
 * The edges between records in one bundle, defined once.
 *
 * Both walks — `trace` and `pack` — consume this module, so they cannot drift
 * into disagreeing about what makes two records neighbours, and a diagnostic
 * pass over the graph can reuse the same definition.
 *
 * An edge is `strauss_links` in the frontmatter and nothing else. A record's
 * prose renders the same claim for a reader that only knows OKF, and `compose`
 * keeps the two in step at write time, so a walk over the body would count the
 * edge a second time and disagree the moment the two drifted.
 *
 * `typed-link` is DIRECTED — the edges a record itself declares.
 * `supersession`, `anchor` and `source` are symmetric: they hold between two
 * records because both name the same thing, so either end sees the other.
 * Callers wanting the inbound half of a typed edge use `kb-links/`
 * (`kb_backlinks`, `kb_impact`) rather than this module, which answers "what
 * does this record point at".
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
    // Outbound only: this is what the record declares about itself. A missing
    // target is legal — records are routinely written before the ones they
    // point at exist — so the walk skips it and `kb_validate` reports it as a
    // warning. A rel outside `linkRels` is skipped too, which is how an
    // unknown rel stays untraversable everywhere rather than one walk at a
    // time.
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
