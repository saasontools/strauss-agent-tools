import {
  anchorFileReader,
  prepareResolvers,
  regexResolver,
  resolveAnchorSpan,
  type AnchorFileReader,
  type AnchorResolver,
  type KbAnchorDriftEntry,
  type KbDriftClass,
} from "../anchor-resolver/index.js";
import type { KbAnchor, KbRecord } from "../kb-record.schema.js";
import { isUncheckedReason } from "../remote-repo/index.js";
import { TreeSitterResolver } from "../tree-sitter-resolver/index.js";
import { readOldSource, type OldSourceOrigin } from "./git.js";
import { movedSearch, type MovedSearch } from "./moved.js";

/**
 * Turning "the bytes changed" into one of four answers, two of which end the
 * matter.
 *
 * The order is not arbitrary: `moved` is asked first because it is the only
 * class that needs no history at all, and `cosmetic` second because it is the
 * only one that needs the old text. What survives both is what a reader has to
 * read — and the whole point of asking the cheap questions first is that most
 * drift never reaches them.
 *
 * Everything here is read-only. Rebaselining a `moved` anchor is a write, and
 * writes belong to the verb the caller named.
 */

export type ClassifiedAnchor = {
  anchor: KbAnchor;
  entry: KbAnchorDriftEntry;
  /** Resolved class. Never `undefined` — every reported anchor gets one. */
  class: KbDriftClass;
  /** The anchored text as it stands now. Absent when the class is `gone`. */
  newText?: string;
  /** The anchored text as it was, when history could produce it. */
  oldText?: string;
  oldOrigin?: OldSourceOrigin;
};

export type ClassifyOptions = {
  /** Test seam: replaces the disk reader. */
  reader?: AnchorFileReader;
  /** Skip the history read. `cosmetic` cannot be reached without it. */
  withHistory?: boolean;
  /**
   * The run's shared `moved` search. A sweep classifying many records passes
   * one, so the repository is listed once and each candidate file is parsed
   * once for the whole sweep rather than once per record.
   */
  search?: MovedSearch;
};

/**
 * Refines one record's drift entries. Anchors that matched, or that name
 * another repository, are not drift and never appear.
 */
export async function classifyDrift(
  repoRoot: string,
  record: KbRecord,
  entries: readonly KbAnchorDriftEntry[],
  options: ClassifyOptions = {},
): Promise<ClassifiedAnchor[]> {
  // `detectAnchorDrift` walks the hash-carrying anchors in frontmatter order
  // and emits one entry each, so index is identity here.
  const anchors = (record.frontmatter.strauss_anchors ?? []).filter(
    (anchor) => anchor.hash,
  );
  const reader = options.reader ?? anchorFileReader(repoRoot);
  const treeSitter = new TreeSitterResolver();
  const resolvers: AnchorResolver[] = [treeSitter, regexResolver];
  const search =
    options.search ??
    movedSearch(repoRoot, { ...(options.reader ? { reader } : {}) });

  const wanted: { anchor: KbAnchor; entry: KbAnchorDriftEntry }[] = [];
  entries.forEach((entry, at) => {
    const anchor = anchors[at];
    if (!anchor) return;
    if (entry.state === "match" || isUncheckedReason(entry.reason)) return;
    wanted.push({ anchor, entry });
  });
  if (!wanted.length) return [];

  await prepareResolvers(
    resolvers,
    wanted.map(({ anchor }) => anchor.file),
  );

  const out: ClassifiedAnchor[] = [];
  for (const { anchor, entry } of wanted) {
    const movedTo = await search.find(anchor);
    if (movedTo) {
      out.push({
        anchor,
        entry: { ...entry, class: "moved", movedTo },
        class: "moved",
      });
      continue;
    }

    const newText = await currentText(reader, anchor, resolvers);
    const old =
      options.withHistory === false
        ? { ok: false as const, reason: "unrecoverable" as const }
        : await readOldSource(repoRoot, anchor);
    const oldText = old.ok ? spanIn(old.source, anchor, resolvers) : undefined;

    const settled: KbDriftClass =
      newText !== undefined &&
      oldText !== undefined &&
      sameTokens(treeSitter, anchor.file, oldText, newText)
        ? "cosmetic"
        : (entry.class ?? "changed");

    out.push({
      anchor,
      entry: { ...entry, class: settled },
      class: settled,
      ...(newText !== undefined ? { newText } : {}),
      ...(oldText !== undefined ? { oldText } : {}),
      ...(old.ok ? { oldOrigin: old.origin } : {}),
    });
  }
  return out;
}

/**
 * Only a parser can say two spellings are one program. Without one — a file
 * with no grammar, or text that will not parse — the answer is no, which
 * leaves the class where it was rather than inventing a reassurance.
 */
function sameTokens(
  resolver: TreeSitterResolver,
  file: string,
  before: string,
  after: string,
): boolean {
  if (before === after) return false;
  const left = resolver.normalize(before, file);
  const right = resolver.normalize(after, file);
  return left !== null && left === right;
}

async function currentText(
  reader: AnchorFileReader,
  anchor: KbAnchor,
  resolvers: readonly AnchorResolver[],
): Promise<string | undefined> {
  const read = await reader(anchor.file);
  if (!read.ok) return undefined;
  return spanIn(read.source, anchor, resolvers);
}

/** The anchor's span within some version of its file, current or committed. */
function spanIn(
  source: string,
  anchor: KbAnchor,
  resolvers: readonly AnchorResolver[],
): string | undefined {
  const outcome = resolveAnchorSpan(source, anchor, resolvers);
  return outcome.ok ? outcome.span.text : undefined;
}
