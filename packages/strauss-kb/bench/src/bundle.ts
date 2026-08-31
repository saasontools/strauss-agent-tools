import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, join } from "node:path";
import { parseMarkdownWithFrontmatter } from "../../src/markdown.js";
import { kbRecordFrontmatterSchema } from "../../src/kb-record.schema.js";
import type { BenchRecord } from "./model.js";

/**
 * The arm-A bundle, as shipped with the benchmark.
 *
 * `blogs/okf-strauss-kb/.kb` -- the bundle the issue named -- does not exist
 * in this repository, and no `.kb` or `.strauss/kb` directory does either, so
 * the benchmark carries its own. See `bench/README.md` for the substitution
 * and for the invariants the fixture has to hold.
 */
export const DEFAULT_BUNDLE_DIR = fileURLToPath(
  new URL("../bundle", import.meta.url),
);

/**
 * Reads a bundle through the package's own frontmatter parser.
 *
 * Using `parseMarkdownWithFrontmatter` rather than a bench-local YAML reader
 * is the point: if the record schema moves, the benchmark's idea of a record
 * moves with it instead of quietly drifting.
 */
export async function loadBundle(
  dir: string = DEFAULT_BUNDLE_DIR,
): Promise<BenchRecord[]> {
  const entries = (await readdir(dir))
    .filter((name) => name.endsWith(".md") && name !== "INDEX.md")
    .sort();

  const records: BenchRecord[] = [];
  for (const entry of entries) {
    const text = await readFile(join(dir, entry), "utf8");
    const parsed = parseMarkdownWithFrontmatter(
      text,
      kbRecordFrontmatterSchema,
    );
    const conceptId = basename(entry, ".md");
    if (!parsed.frontmatter.success) {
      throw new Error(
        `${conceptId}: invalid frontmatter -- ${parsed.frontmatter.error.message}`,
      );
    }
    const frontmatter = parsed.frontmatter.data;

    const generated = frontmatter.generated as { at?: string } | undefined;
    const answered = frontmatter.strauss_answered as
      { by?: string; at?: string } | undefined;

    records.push({
      conceptId,
      type: frontmatter.type,
      title: frontmatter.title ?? conceptId,
      status: frontmatter.strauss_status,
      supersedes: frontmatter.strauss_supersedes ?? [],
      supersededBy: frontmatter.strauss_superseded_by ?? null,
      answeredBy: answered?.by ?? null,
      answeredAt: answered?.at ?? null,
      materiality: frontmatter.strauss_materiality ?? null,
      confidence: frontmatter.strauss_confidence ?? null,
      owner: frontmatter.strauss_owner ?? null,
      recordedAt: generated?.at ?? null,
      tags: frontmatter.tags ?? [],
      body: parsed.content.trim(),
    });
  }
  return records;
}
