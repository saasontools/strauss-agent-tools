import { z } from "zod";
import { adjudicate, type KbStanding } from "../adjudicate.js";
import {
  reassessPacket,
  type KbPacketReferences,
  type KbReassessPacket,
} from "../drift/index.js";
import { KbRecordNotFoundError } from "../kb-errors.js";
import {
  liveReferencesTo,
  staleReferencesFrom,
} from "../kb-references/index.js";
import { assertBaseNotFrozen, KbBaseFrozenError } from "../kb-pins/index.js";
import type { KbAnchor, KbRecord } from "../kb-record.schema.js";
import { argvFlag, bundlePath, conceptId, define, REPO_ROOT } from "./model.js";

/** One anchor whose code turned up unchanged elsewhere, and where. */
export type KbRebaselinedAnchor = {
  file: string;
  symbol?: string;
  toFile: string;
  toSymbol?: string;
};

export type KbReassessResult = {
  conceptId: string;
  /** `null` when nothing survived classification — the record needs no reading. */
  packet: KbReassessPacket | null;
  rebaselined: KbRebaselinedAnchor[];
  /** Anchors whose only change was formatting. Reported, never read. */
  cosmetic: number;
  frozen?: true;
  note?: string;
};

export const reassessCommand = define({
  name: "reassess",
  tool: "kb_reassess",
  usage: "reassess <concept-id> [--repo-root <path>] [--with-diff]",
  description:
    "One record, as something to judge: its claim, each drifted anchor's class, the old-vs-new span diff, what depends on it, and the references it makes or receives that no longer hold. Formatting-only drift is dropped. Empty when there is nothing to reassess. Writes: relocates moved anchors, keeping their hash; never verifies, supersedes, or changes standing.",
  input: z.object({
    bundlePath,
    conceptId,
    repoRoot: REPO_ROOT,
    withDiff: z
      .boolean()
      .optional()
      .describe(
        "Recover each anchor's committed span and render the diff. Reads git history.",
      ),
  }),
  fromArgv: (argv, path) => {
    const repoRoot = argvFlag(argv, "--repo-root");
    return {
      bundlePath: path,
      conceptId: argv[1],
      ...(repoRoot !== undefined ? { repoRoot } : {}),
      ...(argv.includes("--with-diff") ? { withDiff: true } : {}),
    };
  },
  run: async (
    { store, actor },
    { bundlePath: path, conceptId: id, repoRoot, withDiff },
  ): Promise<KbReassessResult> => {
    const root = repoRoot ?? process.cwd();
    const bundle = await store.list(path);
    const record = bundle.find((entry) => entry.conceptId === id);
    if (!record) throw new KbRecordNotFoundError(id);

    const standings = new Map<string, KbStanding>(
      adjudicate(bundle, bundle).map((hit) => [
        hit.record.conceptId,
        hit.standing,
      ]),
    );
    const standing = standings.get(id);
    const references = referenceReview(record, bundle, standings);

    const drift = await store.detectDrift([record], repoRoot);
    const entries = drift?.get(id) ?? [];
    const drifted = entries.some((entry) => entry.state !== "match");
    // A record with no drift and no unresolved reference has nothing anyone
    // needs to read. Drift alone used to be the test, which answered "nothing
    // to reassess" for a record resting on a decision that had been replaced.
    if (
      !drifted &&
      !references.outgoing.length &&
      !references.incoming.length
    ) {
      return { conceptId: id, packet: null, rebaselined: [], cosmetic: 0 };
    }

    // Only asked for once there is drift: the dependants of a record that
    // still holds are not part of this question.
    const impact = drifted ? await store.impact(path, id) : undefined;

    const { packet, classified } = await reassessPacket(root, record, entries, {
      ...(withDiff ? { withDiff: true } : {}),
      ...(impact ? { impact } : {}),
      ...(standing ? { standing } : {}),
      references,
    });

    // `moved` is the one class this command settles rather than reports: the
    // bytes are identical, so the record still describes them and only the
    // address was wrong. The hash is kept exactly as it was — nothing here
    // re-baselines *content*, which would be accepting an edit nobody read.
    const moves = classified.filter((found) => found.class === "moved");
    let frozen = false;
    const rebaselined: KbRebaselinedAnchor[] = [];
    if (moves.length) {
      const relocated = new Map<KbAnchor, KbAnchor>();
      for (const found of moves) {
        const to = found.entry.movedTo;
        if (!to) continue;
        relocated.set(found.anchor, {
          ...found.anchor,
          file: to.file,
          ...(to.symbol ? { symbol: to.symbol } : {}),
          // A span is the anchor's whole address, so relocating it means
          // moving the line range the same code now occupies.
          ...(found.anchor.span
            ? { span: { start: to.startLine, end: to.endLine } }
            : {}),
        });
        rebaselined.push({
          file: found.anchor.file,
          ...(found.anchor.symbol ? { symbol: found.anchor.symbol } : {}),
          toFile: to.file,
          ...(to.symbol ? { toSymbol: to.symbol } : {}),
        });
      }
      try {
        await assertBaseNotFrozen(process.cwd(), path);
      } catch (error) {
        if (!(error instanceof KbBaseFrozenError)) throw error;
        frozen = true;
      }
      if (!frozen) {
        await store.updateAnchors(
          path,
          id,
          (record.frontmatter.strauss_anchors ?? []).map(
            (anchor) => relocated.get(anchor) ?? anchor,
          ),
          actor,
        );
      }
    }

    return {
      conceptId: id,
      packet,
      rebaselined: frozen ? [] : rebaselined,
      cosmetic: classified.filter((found) => found.class === "cosmetic").length,
      ...(frozen
        ? {
            frozen: true as const,
            note: "base is frozen: nothing was rebaselined",
          }
        : {}),
    };
  },
  render: (result) => renderReassess(result as KbReassessResult),
});

/**
 * The two reference questions, asked of whichever one this record can answer.
 *
 * A record that still holds is asked what it is leaning on that stopped
 * holding. A record that has itself stopped holding is asked the inverse: who
 * is still leaning on it, so a reader settling its replacement can find the
 * open risks and questions that were resting on the old answer. Neither is
 * acted on here — `reassess` reports, and never closes, retargets or verifies
 * anything on the strength of a link.
 */
function referenceReview(
  record: KbRecord,
  bundle: KbRecord[],
  standings: Map<string, KbStanding>,
): KbPacketReferences {
  const standing = standings.get(record.conceptId);
  const outOfForce = standing === "superseded" || standing === "rejected";
  return {
    outgoing: outOfForce
      ? []
      : staleReferencesFrom(
          record,
          new Map(bundle.map((entry) => [entry.conceptId, entry])),
          standings,
        ),
    incoming: outOfForce
      ? liveReferencesTo(record.conceptId, bundle, standings)
      : [],
  };
}

/**
 * The packet as prose, because it is read rather than parsed. `--json` is the
 * machine shape; everything below exists so a reader can answer without
 * opening the repository.
 */
export function renderReassess(result: KbReassessResult): string {
  const lines: string[] = [];
  for (const move of result.rebaselined) {
    lines.push(
      `rebaselined: ${at(move.file, move.symbol)} → ${at(move.toFile, move.toSymbol)} (same code, new address)`,
    );
  }
  if (result.cosmetic) {
    lines.push(
      `${result.cosmetic} anchor${result.cosmetic === 1 ? "" : "s"} changed formatting only.`,
    );
  }
  if (result.note) lines.push(result.note);

  const packet = result.packet;
  if (!packet) {
    lines.push(`${result.conceptId}: nothing to reassess.`);
    return lines.join("\n");
  }

  lines.push(
    "",
    `# ${packet.conceptId}${packet.title ? ` — ${packet.title}` : ""}`,
    `type: ${packet.type}   standing: ${packet.standing}`,
    ...(packet.why ? [`why: ${packet.why}`] : []),
    ...(packet.claim
      ? ["", `## ${packet.claim.section}`, packet.claim.text]
      : []),
    "",
    `## Anchors (${packet.anchors.length})`,
  );

  for (const anchor of packet.anchors) {
    lines.push(
      `- ${at(anchor.file, anchor.symbol)} — ${anchor.class}${anchor.reason ? ` (${anchor.reason})` : ""}`,
    );
    if (!anchor.diff) continue;
    if (anchor.diff.status === "unrecoverable") {
      lines.push(
        "  diff: unrecoverable — no committed span to compare against",
      );
      continue;
    }
    lines.push(
      `  diff vs ${anchor.diff.ref} (${anchor.diff.source}): +${anchor.diff.added} −${anchor.diff.removed}`,
      ...anchor.diff.unified.split("\n").map((line) => `  ${line}`),
    );
  }

  const { outgoing, incoming } = packet.references;
  if (outgoing.length) {
    lines.push("", `## References that no longer hold (${outgoing.length})`);
    for (const entry of outgoing) {
      lines.push(
        `- ${entry.target} [${entry.targetStanding}] ${where(entry.origins, entry.rels)}${
          entry.replacedBy.length
            ? ` — replaced by ${entry.replacedBy.join(" → ")}`
            : ""
        }`,
      );
    }
  }

  if (incoming.length) {
    lines.push("", `## Still pointing here (${incoming.length})`);
    for (const entry of incoming) {
      lines.push(
        `- ${entry.from} [${entry.standing}] ${where(entry.origins, entry.rels)}${
          entry.title ? ` — ${entry.title}` : ""
        }`,
      );
    }
  }

  if (packet.impact.length) {
    lines.push("", `## Impact (${packet.impact.length})`);
    for (const entry of packet.impact) {
      lines.push(
        `- ${entry.conceptId} [${entry.standing}]${entry.title ? ` — ${entry.title}` : ""}`,
      );
    }
    if (packet.impactTruncated) lines.push("- … walk truncated");
  }

  lines.push("", `Default: ${packet.default} — ${packet.defaultNote}.`);
  return lines.join("\n");
}

function at(file: string, symbol?: string): string {
  return symbol ? `${file}:${symbol}` : file;
}

/** Where the pointer is written, and what it claims where it is typed. */
function where(origins: readonly string[], rels: readonly string[]): string {
  const parts = [...origins];
  if (rels.length) parts.push(rels.join(", "));
  return `(${parts.join(", ")})`;
}
