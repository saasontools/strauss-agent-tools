import { edgeNeighbours } from "./kb-edges.js";
import type { KbRecord } from "./kb-record.schema.js";
import { KB_CAUSAL_LINK_RELS } from "./record-types.js";

/**
 * Edges a trace may follow: every kb-edges.ts kind, narrowed to the causal
 * rels. `related_to` reaches whatever a writer thought worth mentioning, which
 * suits a bounded pack but floods a timeline. `strauss_answered` carries no
 * target id, so a question's resolution is not an edge.
 */
export const TRACE_EDGES = [
  "typed-link",
  "supersession",
  "anchor",
  "source",
] as const;
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
  /** A trace is always bounded: supersession and shared anchors alone can reach the whole bundle. */
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
        for (const record of edgeNeighbours(
          from,
          bundle,
          edge,
          KB_CAUSAL_LINK_RELS,
        )) {
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

function byGeneratedAt(left: KbTraceStep, right: KbTraceStep): number {
  const at = (step: KbTraceStep) => step.record.frontmatter.generated?.at ?? "";
  return at(left).localeCompare(at(right)) || left.depth - right.depth;
}
