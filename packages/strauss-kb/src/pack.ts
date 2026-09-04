import { adjudicate, type KbStanding, type KbWarning } from "./adjudicate.js";
import { neighbours } from "./kb-edges.js";
import {
  KbPackBudgetExceededError,
  KbRecordNotFoundError,
} from "./kb-errors.js";
import {
  KB_RECORD_TYPES,
  type KbAnchor,
  type KbRecord,
} from "./kb-record.schema.js";
import {
  DEFAULT_LOAD_BUDGET,
  estimateStubTokens,
  estimateTokens,
  stub,
  type KbSupersededStub,
} from "./kb-store.js";

export const DEFAULT_PACK_HOPS = 2;
export const DEFAULT_PACK_MAX_NODES = 20;

export type KbPackOptions = {
  /** How far from the root the walk may reach. */
  hops?: number;
  /** How many records the pack may hold, root included. */
  maxNodes?: number;
  /** Approximate token ceiling over what is actually emitted. */
  budgetTokens?: number;
};

/** One record as the pack emits it — the same mapping `kb_load` hands back. */
export type KbPackedRecord = {
  conceptId: string;
  title: string | null;
  standing: KbStanding;
  supersededBy: string[];
  warnings: KbWarning[];
  anchors: KbAnchor[];
  body: string;
};

/**
 * Deliberately timestamp-free: the same bundle and root must produce the same
 * bytes on every run, so a caller can diff two packs and trust that a changed
 * byte means changed knowledge.
 */
export type KbPackResult = {
  root: string;
  records: KbPackedRecord[];
  /** Named only, exactly as `load` stubs them. Bodies reachable via trace. */
  superseded: KbSupersededStub[];
  /** Every reachable record the hop and node limits cut, never summarized. */
  excluded: string[];
  recordCount: number;
  tokensLoaded: number;
  budgetTokens: number;
};

// What a reader wants first when the walk has to cut: what was settled
// (decision), then what binds (constraint, requirement), then the rest in
// their declared order.
const TYPE_PRIORITY: readonly string[] = [
  "decision",
  "constraint",
  "requirement",
  ...KB_RECORD_TYPES.filter(
    (type) => !["decision", "constraint", "requirement"].includes(type),
  ),
];

type Reached = { record: KbRecord; depth: number };

/**
 * A bounded, progressively disclosed neighbourhood around one record.
 *
 * Where `load` hands over a whole base and `trace` a timeline, a pack is the
 * subgraph a reader needs to act near one record: everything within `hops`
 * of the root, cut to `maxNodes` by ranking, with every cut id listed —
 * a named gap is knowable, a silent one is not.
 *
 * Adjudication runs against the whole bundle, not the reached slice, so a
 * record's standing cannot depend on whether its replacement happened to be
 * within reach. Superseded records become the same stubs `load` emits, costed
 * as stubs, and the budget is a refusal rather than a truncation: a partial
 * pack looks complete to its reader.
 */
export function pack(
  bundle: KbRecord[],
  rootId: string,
  options: KbPackOptions = {},
): KbPackResult {
  const hops = options.hops ?? DEFAULT_PACK_HOPS;
  const maxNodes = options.maxNodes ?? DEFAULT_PACK_MAX_NODES;
  const budgetTokens = options.budgetTokens ?? DEFAULT_LOAD_BUDGET;

  const byId = new Map(bundle.map((record) => [record.conceptId, record]));
  const root = byId.get(rootId);
  if (!root) throw new KbRecordNotFoundError(rootId);

  // The whole reachable component is walked, not just the first `hops` rings:
  // the bundle is already in memory, and knowing what lies past the bound is
  // what lets the excluded list name records instead of waving at them.
  const reached: Reached[] = [{ record: root, depth: 0 }];
  const seen = new Set([rootId]);
  let frontier: KbRecord[] = [root];
  for (let depth = 1; frontier.length; depth += 1) {
    const next: KbRecord[] = [];
    for (const from of frontier) {
      for (const { record } of neighbours(from, bundle)) {
        if (seen.has(record.conceptId)) continue;
        seen.add(record.conceptId);
        reached.push({ record, depth });
        next.push(record);
      }
    }
    frontier = next;
  }

  reached.sort(byRank);
  const within = reached.filter((entry) => entry.depth <= hops);
  const kept = within.slice(0, maxNodes);
  const excluded = [
    ...within.slice(maxNodes),
    ...reached.filter((entry) => entry.depth > hops),
  ]
    .map((entry) => entry.record.conceptId)
    .sort();

  const adjudicated = adjudicate(
    kept.map((entry) => entry.record),
    bundle,
  );
  const superseded = adjudicated
    .filter((hit) => hit.standing === "superseded")
    .map(stub);
  const whole = adjudicated.filter((hit) => hit.standing !== "superseded");

  const tokensLoaded =
    whole.reduce((total, hit) => total + estimateTokens(hit.record), 0) +
    superseded.reduce((total, entry) => total + estimateStubTokens(entry), 0);
  const recordCount = adjudicated.length;

  if (tokensLoaded > budgetTokens) {
    throw new KbPackBudgetExceededError(
      recordCount,
      tokensLoaded,
      budgetTokens,
      excluded,
    );
  }

  return {
    root: rootId,
    records: whole.map((hit) => ({
      conceptId: hit.record.conceptId,
      title: hit.record.frontmatter.title ?? null,
      standing: hit.standing,
      supersededBy: hit.heads.map((head) => head.conceptId),
      warnings: hit.warnings,
      anchors: hit.record.frontmatter.strauss_anchors ?? [],
      body: hit.record.body,
    })),
    superseded,
    excluded,
    recordCount,
    tokensLoaded,
    budgetTokens,
  };
}

function byRank(left: Reached, right: Reached): number {
  return (
    left.depth - right.depth ||
    typeRank(left.record) - typeRank(right.record) ||
    (left.record.frontmatter.title ?? "").localeCompare(
      right.record.frontmatter.title ?? "",
    ) ||
    left.record.conceptId.localeCompare(right.record.conceptId)
  );
}

// A foreign type — legal under OKF — ranks after every known one.
function typeRank(record: KbRecord): number {
  const index = TYPE_PRIORITY.indexOf(record.frontmatter.type);
  return index === -1 ? TYPE_PRIORITY.length : index;
}
