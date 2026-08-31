import { edgeNeighbours } from "./kb-edges.js";
import type { KbRecord } from "./kb-record.schema.js";
import { KB_CAUSAL_LINK_RELS } from "./record-types.js";

/**
 * Edges a trace may follow — the shared kb-edges.ts definitions, minus
 * `body-link`: body links can reach most of a bundle from anywhere, which
 * suits a bounded pack but floods a timeline. Also absent by design:
 * `strauss_answered` carries no target id, so a question's resolution lives
 * in its own body rather than in another record.
 *
 * `typed-link` is in, where `body-link` is out, because the two differ in how
 * cheaply they are made. A body link is any markdown a writer happened to
 * type; a `strauss_links` entry is a deliberate claim from a closed vocabulary
 * about what this record depends on. That is exactly the kind of edge a
 * timeline should follow — "we chose this because of that" is the history.
 *
 * Only the causal rels, though. `related_to` asserts no dependence and reaches
 * whatever a writer thought worth mentioning, which is the same flooding
 * `body-link` is excluded for; a bibliography is a neighbourhood's business
 * (`pack`), not a history's.
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
