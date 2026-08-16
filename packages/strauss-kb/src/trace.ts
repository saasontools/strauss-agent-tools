import type { KbRecord } from "./kb-record.schema.js";

/**
 * Edges a trace may follow.
 *
 * Two more are conceivable and absent: `strauss_answered` carries no target id,
 * so a question's resolution lives in its own body rather than in another
 * record; and following OKF's body markdown links would need a markdown AST
 * pass this package does not yet do.
 */
export const TRACE_EDGES = ["supersession", "anchor", "source"] as const;
export type KbTraceEdge = (typeof TRACE_EDGES)[number];

export type KbTraceStep = {
  record: KbRecord;
  /** Hops from the seed. 0 is the seed itself. */
  depth: number;
  /** Why this record was reached. Empty for the seed. */
  via: KbTraceEdge[];
};

export type KbTraceOptions = {
  edges?: readonly KbTraceEdge[];
  /** Body links alone can reach the whole bundle, so a trace is always bounded. */
  depth?: number;
};

/**
 * How a position was arrived at, as a timeline.
 *
 * The inverse of a point query, and the reason the two cannot be one call with
 * a flag: there, a `rejected` record is the most dangerous thing retrievable —
 * here it is the content. A trace that drops the rejected alternatives and the
 * superseded earlier understanding has removed the answer and kept the
 * conclusion, which is what reading a diff already gives you.
 *
 * Ordered by `generated.at` rather than by relevance. Ranking a history is
 * meaningless when the sequence is the point.
 */
export function trace(
  seedId: string,
  bundle: KbRecord[],
  options: KbTraceOptions = {},
): KbTraceStep[] {
  const edges = options.edges?.length ? options.edges : TRACE_EDGES;
  const maxDepth = options.depth ?? 3;
  const byId = new Map(bundle.map((record) => [record.conceptId, record]));
  const seed = byId.get(seedId);
  if (!seed) return [];

  const reached = new Map<string, KbTraceStep>([
    [seedId, { record: seed, depth: 0, via: [] }],
  ]);
  let frontier: KbRecord[] = [seed];

  for (let depth = 1; depth <= maxDepth && frontier.length; depth += 1) {
    const next: KbRecord[] = [];
    for (const from of frontier) {
      for (const edge of edges) {
        for (const record of neighbours(from, bundle, edge)) {
          const existing = reached.get(record.conceptId);
          if (existing) {
            // Reached twice by different edges: keep the shorter path, but
            // record both reasons — "shares an anchor and replaces it" is more
            // informative than either alone. The seed keeps an empty `via`,
            // since it was not reached by anything.
            if (existing.depth > 0 && !existing.via.includes(edge)) {
              existing.via.push(edge);
            }
            continue;
          }
          reached.set(record.conceptId, { record, depth, via: [edge] });
          next.push(record);
        }
      }
    }
    frontier = next;
  }

  return [...reached.values()].sort(byGeneratedAt);
}

function neighbours(
  from: KbRecord,
  bundle: KbRecord[],
  edge: KbTraceEdge,
): KbRecord[] {
  switch (edge) {
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
 * would hide the file-level record from every symbol-level trace, which is the
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

function byGeneratedAt(left: KbTraceStep, right: KbTraceStep): number {
  const at = (step: KbTraceStep) => step.record.frontmatter.generated?.at ?? "";
  return at(left).localeCompare(at(right)) || left.depth - right.depth;
}
