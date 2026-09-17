import { z } from "zod";
import { bodyCitations } from "../body-citations.js";
import { assertBaseNotFrozen } from "../kb-pins/index.js";
import type { KbLink, KbRecord } from "../kb-record.schema.js";
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
};

export const mirrorLinksCommand = define({
  name: "mirror-links",
  tool: "kb_mirror_links",
  usage: "mirror-links [--dry-run]",
  description:
    "One-time migration: copy every markdown citation in a record's prose into strauss_links as related_to, where the frontmatter does not already declare the target. Run it once per base before upgrading; afterwards nothing reads the body for edges. Idempotent.",
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
    const pending = bundle
      .map((record) => ({
        conceptId: record.conceptId,
        added: unmirrored(record),
      }))
      .filter((entry) => entry.added.length > 0);

    if (dryRun) {
      return {
        dryRun: true,
        recordCount: bundle.length,
        mirrored: [],
        pending,
      };
    }

    // Guarded here rather than at the top, like `sweep`: a dry run writes
    // nothing, and a frozen base is where a reader most wants the answer.
    await assertBaseNotFrozen(process.cwd(), path);

    const byId = new Map(bundle.map((record) => [record.conceptId, record]));
    const mirrored: KbMirroredRecord[] = [];
    for (const entry of pending) {
      const record = byId.get(entry.conceptId);
      if (!record) continue;
      const links: KbLink[] = [
        ...(record.frontmatter.strauss_links ?? []),
        ...entry.added.map((target) => ({
          target,
          rel: "related_to" as const,
        })),
      ];
      await store.updateLinks(path, entry.conceptId, links, actor);
      mirrored.push(entry);
    }
    // The index carries each record's links; a partial run leaves it wrong.
    await store.readIndex(path);
    await store.dropSearchIndex(path);

    return { dryRun: false, recordCount: bundle.length, mirrored, pending };
  },
  render: (result) => renderMirrorLinks(result as KbMirrorLinksResult),
});

/**
 * Targets this record's prose cites that its frontmatter does not declare.
 *
 * `related_to` is the only rel a citation can be read as: prose states a
 * pointer, never a direction of dependence, and inventing a stronger claim
 * from a markdown link would put a dependency in the base nobody wrote. A
 * target that already carries any rel keeps it.
 */
function unmirrored(record: KbRecord): string[] {
  const declared = new Set(
    (record.frontmatter.strauss_links ?? []).map((link) => link.target),
  );
  return [...bodyCitations(record)].filter((target) => !declared.has(target));
}

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
  return lines.join("\n");
}
