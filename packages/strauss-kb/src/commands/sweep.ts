import { z } from "zod";
import { adjudicate, type KbAdjudicated } from "../adjudicate.js";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import { inboundIndex } from "../kb-links/index.js";
import type { KbRecord, KbRecordStatus } from "../kb-record.schema.js";
import { argvFlag, bundlePath, define } from "./model.js";

/**
 * The statuses a record can be swept from: it is settled, so nothing later
 * reads it for an answer.
 */
const TERMINAL: readonly KbRecordStatus[] = [
  "resolved",
  "rejected",
  "superseded",
];

/** One record kept back, and the surviving records still pointing at it. */
export type KbSweptSkip = {
  conceptId: string;
  heldBy: string[];
};

/** One candidate a real run did not remove, and why. */
export type KbSweepFailure = {
  conceptId: string;
  reason: string;
};

export type KbSweepResult = {
  tag: string;
  dryRun: boolean;
  /** Ids removed — empty under `--dry-run`, where `candidates` says what would go. */
  deleted: string[];
  /** Ids a real run would delete. Equals `deleted` once one has, minus `failed`. */
  candidates: string[];
  skipped: KbSweptSkip[];
  /** Candidates a real run could not remove. Empty under `--dry-run`. */
  failed: KbSweepFailure[];
};

export const sweepCommand = define({
  name: "sweep",
  tool: "kb_sweep",
  usage: "sweep --tag <tag> --terminal [--dry-run]",
  description:
    "Delete tagged records that are resolved, rejected or superseded. Refuses without --tag, keeps any record a surviving record still points at, and logs each deletion.",
  input: z.object({
    bundlePath,
    tag: z
      .string({ error: "sweep needs --tag: it never sweeps a whole base" })
      .min(1)
      .describe("Only records carrying this tag are considered."),
    terminal: z
      .literal(true, {
        error: "sweep needs --terminal: it deletes only settled records",
      })
      .describe(
        "Required. Names the only scope sweep deletes: resolved, rejected and superseded records.",
      ),
    dryRun: z
      .boolean()
      .optional()
      .describe("Report what would go, and delete nothing."),
  }),
  fromArgv: (argv, path) => ({
    bundlePath: path,
    tag: argvFlag(argv, "--tag"),
    ...(argv.includes("--terminal") ? { terminal: true as const } : {}),
    ...(argv.includes("--dry-run") ? { dryRun: true } : {}),
  }),
  run: async (
    { store, actor },
    { bundlePath: path, tag, dryRun },
  ): Promise<KbSweepResult> => {
    const bundle = await store.list(path);
    const held = holderIndex(bundle);
    const candidates = adjudicate(bundle, bundle).filter((hit) =>
      sweepable(hit, tag),
    );

    // A record only goes if nothing that stays points at it, and whether a
    // holder stays is itself the question — so shrink the doomed set until it
    // stops shrinking rather than judging every candidate against the first
    // guess.
    const doomed = new Set(candidates.map((hit) => hit.record.conceptId));
    let changed = true;
    while (changed) {
      changed = false;
      for (const conceptId of [...doomed]) {
        if (survivorsHolding(conceptId, held, doomed).length === 0) continue;
        doomed.delete(conceptId);
        changed = true;
      }
    }

    const skipped = candidates
      .filter((hit) => !doomed.has(hit.record.conceptId))
      .map((hit) => ({
        conceptId: hit.record.conceptId,
        heldBy: survivorsHolding(hit.record.conceptId, held, doomed),
      }));
    const ordered = [...doomed].sort();

    if (dryRun) {
      return {
        tag,
        dryRun: true,
        deleted: [],
        candidates: ordered,
        skipped,
        failed: [],
      };
    }

    // Guarded here rather than at the top: a dry run writes nothing, and a
    // frozen base is exactly where a reader wants to see what a sweep would do.
    await assertBaseNotFrozen(process.cwd(), path);

    const deleted: string[] = [];
    const failed: KbSweepFailure[] = [];
    try {
      for (const conceptId of ordered) {
        try {
          const outcome = await store.deleteRecord(
            path,
            conceptId,
            { tag, statuses: TERMINAL },
            actor,
          );
          if (outcome === "deleted") deleted.push(conceptId);
          else failed.push({ conceptId, reason: outcome });
        } catch (error) {
          // One id failing is not the run failing: the rest still go, and the
          // caller is told which did not rather than being handed a throw
          // after an unknown number of deletions.
          failed.push({
            conceptId,
            reason: error instanceof Error ? error.message : "unknown",
          });
        }
      }
    } finally {
      // Both projections are derived, and a partial run leaves both wrong.
      await store.readIndex(path);
      await store.dropSearchIndex(path);
    }

    return {
      tag,
      dryRun: false,
      deleted,
      candidates: ordered,
      skipped,
      failed,
    };
  },
  render: (result) => renderSweep(result as KbSweepResult),
});

function sweepable(hit: KbAdjudicated, tag: string): boolean {
  const { tags, strauss_status } = hit.record.frontmatter;
  return (
    (tags ?? []).includes(tag) &&
    // Supersession is a standing, settled against the whole base; the other
    // two are the record's own word for itself.
    (hit.standing === "superseded" ||
      strauss_status === "resolved" ||
      strauss_status === "rejected")
  );
}

/**
 * Everything pointing at a record, by target: typed links plus both
 * supersession pointers. A pointer is not an edge, but a survivor left holding
 * one at a swept record has a dangling id `validate` faults.
 */
function holderIndex(bundle: KbRecord[]): Map<string, Set<string>> {
  const byTarget = new Map<string, Set<string>>();
  const hold = (target: string, from: string) => {
    if (target === from) return;
    const holders = byTarget.get(target) ?? new Set<string>();
    holders.add(from);
    byTarget.set(target, holders);
  };

  for (const [target, edges] of inboundIndex(bundle)) {
    for (const edge of edges) hold(target, edge.from);
  }
  for (const record of bundle) {
    const { strauss_supersedes, strauss_superseded_by } = record.frontmatter;
    for (const old of strauss_supersedes ?? []) hold(old, record.conceptId);
    if (strauss_superseded_by) hold(strauss_superseded_by, record.conceptId);
  }
  return byTarget;
}

/** Records outside `doomed` that point at `conceptId`. */
function survivorsHolding(
  conceptId: string,
  held: Map<string, Set<string>>,
  doomed: Set<string>,
): string[] {
  return [...(held.get(conceptId) ?? [])]
    .filter((from) => !doomed.has(from))
    .sort();
}

export function renderSweep(result: KbSweepResult): string {
  const shown = result.dryRun ? result.candidates : result.deleted;
  const verb = result.dryRun ? "would delete" : "deleted";
  const lines = [`${verb} ${shown.length} (tag: ${result.tag})`];
  for (const conceptId of shown) lines.push(`- ${conceptId}`);
  for (const skip of result.skipped) {
    lines.push(`kept ${skip.conceptId} — held by ${skip.heldBy.join(", ")}`);
  }
  for (const failure of result.failed) {
    lines.push(`failed ${failure.conceptId} — ${failure.reason}`);
  }
  return lines.join("\n");
}
