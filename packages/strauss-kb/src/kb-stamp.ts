/**
 * A base's content stamp: `load`'s digest, and the per-record digests it is
 * built from.
 *
 * The aggregate answers "did anything change"; the per-record entries answer
 * "which records", which is what a reload notice has to name. One pass
 * produces both, so `load` and `stamp` cannot disagree.
 */
import { createHash } from "node:crypto";
import { stringifyMarkdownWithFrontmatter } from "./markdown.js";
import type { KbAdjudicated } from "./adjudicate.js";
import type { KbSupersededStub } from "./kb-store.js";

export type KbRecordStamp = { conceptId: string; digest: string };

export type KbBundleStamp = { digest: string; records: KbRecordStamp[] };

export function sha256(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}

/**
 * Entries are sorted by concept id, so the digest never depends on listing
 * order; each is hashed over its record's canonical recomposed form, not the
 * on-disk bytes; superseded stubs are included, so a standing flip changes the
 * digest even when the body did not.
 */
export function bundleStamp(
  records: KbAdjudicated[],
  superseded: KbSupersededStub[],
): KbBundleStamp {
  const entries: KbRecordStamp[] = [
    ...records.map((hit) => ({
      conceptId: hit.record.conceptId,
      digest: `current:${sha256(
        stringifyMarkdownWithFrontmatter(
          hit.record.body,
          hit.record.frontmatter,
        ),
      )}`,
    })),
    ...superseded.map((entry) => ({
      conceptId: entry.conceptId,
      digest: `superseded:${sha256(JSON.stringify(entry))}`,
    })),
  ].sort((a, b) => (a.conceptId < b.conceptId ? -1 : 1));

  return {
    digest: sha256(
      entries.map((entry) => `${entry.conceptId}:${entry.digest}`).join("\n"),
    ),
    records: entries,
  };
}

export function bundleDigest(
  records: KbAdjudicated[],
  superseded: KbSupersededStub[],
): string {
  return bundleStamp(records, superseded).digest;
}
