import { z } from "zod";
import { adjudicate } from "../adjudicate.js";
import { reassessPacket, type KbReassessPacket } from "../drift/index.js";
import { KbRecordNotFoundError } from "../kb-errors.js";
import { assertBaseNotFrozen, KbBaseFrozenError } from "../kb-pins/index.js";
import type { KbAnchor } from "../kb-record.schema.js";
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
    "One drifted record, as something to judge: its claim, each anchor's drift class, the old-vs-new span diff, and what depends on it. Anchors whose code only moved are rebaselined and dropped; formatting-only changes are dropped. Empty for a record with nothing to reassess. Never verifies and never supersedes.",
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

    const drift = await store.detectDrift([record], repoRoot);
    const entries = drift?.get(id) ?? [];
    if (!entries.some((entry) => entry.state !== "match")) {
      return { conceptId: id, packet: null, rebaselined: [], cosmetic: 0 };
    }

    const standing = adjudicate(bundle, bundle).find(
      (hit) => hit.record.conceptId === id,
    )?.standing;
    // Only asked for once there is drift: the dependants of a record that
    // still holds are not part of this question.
    const impact = await store.impact(path, id);

    const { packet, classified } = await reassessPacket(root, record, entries, {
      ...(withDiff ? { withDiff: true } : {}),
      impact,
      ...(standing ? { standing } : {}),
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
