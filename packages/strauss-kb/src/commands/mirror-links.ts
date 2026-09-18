import { z } from "zod";
import {
  KbBodyUnreadableError,
  unmirroredCitations,
} from "../body-citations.js";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import { bundlePath, define } from "./model.js";

/** One record's unmirrored citations, and the links they became. */
export type KbMirroredRecord = {
  conceptId: string;
  /** Targets the prose cited that `strauss_links` did not declare. */
  added: string[];
};

export type KbMirrorLinksResult = {
  dryRun: boolean;
  recordCount: number;
  /** Records a real run rewrote — empty under `--dry-run`, where `pending` says which would be. */
  mirrored: KbMirroredRecord[];
  /** Records a real run would rewrite. Equals `mirrored` once one has. */
  pending: KbMirroredRecord[];
  /** Bodies the parser refused. Named, never mirrored, never silently skipped. */
  unreadable: { conceptId: string; reason: string }[];
};

export const mirrorLinksCommand = define({
  name: "mirror-links",
  tool: "kb_mirror_links",
  usage: "mirror-links [--dry-run]",
  description:
    "One-time migration: copy every markdown citation in a record's prose into strauss_links as related_to, where the frontmatter does not already declare the target. Run it once per base; sweep refuses until it has. Idempotent.",
  input: z.object({
    bundlePath,
    dryRun: z
      .boolean()
      .optional()
      .describe("Report what would be mirrored, and write nothing."),
  }),
  fromArgv: (argv, path) => ({
    bundlePath: path,
    ...(argv.includes("--dry-run") ? { dryRun: true } : {}),
  }),
  run: async (
    { store, actor },
    { bundlePath: path, dryRun },
  ): Promise<KbMirrorLinksResult> => {
    const bundle = await store.list(path);
    const pending: KbMirroredRecord[] = [];
    const unreadable: KbMirrorLinksResult["unreadable"] = [];
    for (const record of bundle) {
      try {
        const added = unmirroredCitations(record);
        if (added.length) pending.push({ conceptId: record.conceptId, added });
      } catch (error) {
        if (!(error instanceof KbBodyUnreadableError)) throw error;
        unreadable.push({ conceptId: record.conceptId, reason: error.message });
      }
    }

    if (dryRun) {
      return {
        dryRun: true,
        recordCount: bundle.length,
        mirrored: [],
        pending,
        unreadable,
      };
    }

    // Guarded here rather than at the top, like `sweep`: a dry run writes
    // nothing, and a frozen base is where a reader most wants the answer.
    await assertBaseNotFrozen(process.cwd(), path);

    const mirrored: KbMirroredRecord[] = [];
    for (const entry of pending) {
      await store.mirrorLinks(path, entry.conceptId, entry.added, actor);
      mirrored.push(entry);
    }
    // The index carries each record's links; a partial run leaves it wrong.
    await store.readIndex(path);
    await store.dropSearchIndex(path);

    return {
      dryRun: false,
      recordCount: bundle.length,
      mirrored,
      pending,
      unreadable,
    };
  },
  render: (result) => renderMirrorLinks(result as KbMirrorLinksResult),
});

export function renderMirrorLinks(result: KbMirrorLinksResult): string {
  const shown = result.dryRun ? result.pending : result.mirrored;
  const verb = result.dryRun ? "would mirror" : "mirrored";
  const edges = shown.reduce((total, entry) => total + entry.added.length, 0);
  const lines = [
    `${verb} ${edges} citation${edges === 1 ? "" : "s"} across ${shown.length} of ${result.recordCount} records`,
  ];
  for (const entry of shown) {
    lines.push(`- ${entry.conceptId} → ${entry.added.join(", ")}`);
  }
  for (const entry of result.unreadable) {
    lines.push(`unreadable ${entry.conceptId} — ${entry.reason}`);
  }
  return lines.join("\n");
}
