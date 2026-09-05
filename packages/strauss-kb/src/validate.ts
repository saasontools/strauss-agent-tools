import { isCanonicalRepoUrl } from "./anchor-resolver/index.js";
import { KB_CONCEPT_ID_PATTERN, type KbRecord } from "./kb-record.schema.js";
import { isKbLinkRel, isKbRecordType, KB_LINK_RELS } from "./record-types.js";

/** `error` fails the check; `warning` does not. */
export type KbValidationSeverity = "error" | "warning";

export type KbValidationProblem = {
  check: string;
  conceptId: string;
  note: string;
  severity: KbValidationSeverity;
};

/**
 * Checks that only hold across the whole bundle: whether one record's pointers
 * agree with another's. Per-record shape is the schema's job, enforced on every
 * read, so nothing here re-states it.
 */
export function validateBundle(records: KbRecord[]): KbValidationProblem[] {
  const byId = new Map(records.map((record) => [record.conceptId, record]));
  const problems: KbValidationProblem[] = [];
  const report = (
    check: string,
    conceptId: string,
    note: string,
    severity: KbValidationSeverity = "error",
  ) => problems.push({ check, conceptId, note, severity });

  for (const record of records) {
    const { conceptId, frontmatter: fm } = record;

    // OKF permits any `type`, so an unrecognised one is a note, not a failure:
    // another producer may legitimately be writing into this bundle.
    if (!isKbRecordType(fm.type)) {
      report("type", conceptId, `unrecognised type "${fm.type}"`);
    }

    if (fm.strauss_status === "superseded") {
      const by = fm.strauss_superseded_by;
      if (!by) {
        report("superseded_by", conceptId, "superseded with no replacement");
      } else if (!byId.has(by)) {
        report("superseded_by", conceptId, `replacement ${by} is missing`);
      } else if (
        !byId.get(by)?.frontmatter.strauss_supersedes?.includes(conceptId)
      ) {
        report("backlink", by, `does not list ${conceptId} in supersedes`);
      }
    }

    for (const old of fm.strauss_supersedes ?? []) {
      const previous = byId.get(old);
      if (!previous) {
        report("supersedes", conceptId, `target ${old} is missing`);
      } else if (previous.frontmatter.strauss_status !== "superseded") {
        report("supersedes", conceptId, `${old} is not marked superseded`);
      }
    }

    for (const link of fm.strauss_links ?? []) {
      // The vocabulary is closed, and this is where that is enforced. An
      // unknown rel is not a record another producer wrote in good faith the
      // way an unknown `type` is — `rel` is this package's own extension, so
      // there is no spec under which a foreign spelling is legitimate, and
      // every walk over the graph would silently skip it.
      if (!isKbLinkRel(link.rel)) {
        report(
          "link_rel",
          conceptId,
          `unknown rel "${link.rel}" on link to ${link.target} — expected one of ${KB_LINK_RELS.join(", ")}`,
        );
      }

      // A target is an error or a warning depending on whether time can fix
      // it. An id that does not match the concept-id pattern can never name a
      // record — no write could produce that filename — so it is a defect
      // now and forever. A well-formed id that is simply absent is the
      // ordinary state of a base being written, and the same tolerance body
      // links already have.
      if (!KB_CONCEPT_ID_PATTERN.test(link.target)) {
        report(
          "link_target",
          conceptId,
          `target "${link.target}" is not a valid concept id — expected <type>.<slug>, both kebab-case`,
        );
      } else if (link.target === conceptId) {
        // The composer refuses this outright; reaching it means a hand-edit,
        // and a self-link is inert rather than wrong — nothing traverses it.
        report(
          "link_target",
          conceptId,
          `links to itself (${link.rel})`,
          "warning",
        );
      } else if (!byId.has(link.target)) {
        report(
          "link_target",
          conceptId,
          `target ${link.target} is not in the bundle`,
          "warning",
        );
      }
    }

    // A short `repo` names a repository without saying where it lives, so a
    // foreign anchor carrying one can never be fetched. A warning, not an
    // error: it still matches this root's own origin, and records are never
    // rewritten under an author.
    for (const anchor of fm.strauss_anchors ?? []) {
      // A symbol and a span are two ways to name one range, and a resolver
      // handed both has to pick — which is a guess about what the author meant.
      if (anchor.span && anchor.symbol) {
        report(
          "anchor_span",
          conceptId,
          `anchor ${anchor.file} names both a symbol and a span — one or the other`,
        );
      }

      // A backwards range resolves to nothing, and an `ast` hash over a span
      // is compared against a raw one for ever. Both only reach a bundle by
      // hand: the write schema refuses them.
      if (anchor.span && anchor.span.end < anchor.span.start) {
        report(
          "anchor_span",
          conceptId,
          `anchor ${anchor.file} span ${anchor.span.start}-${anchor.span.end} ends before it starts`,
        );
      }

      if (anchor.span && anchor.hash_kind === "ast") {
        report(
          "anchor_span",
          conceptId,
          `anchor ${anchor.file} is a span with hash_kind: "ast" — a span is hashed raw`,
        );
      }

      // Committed code has no address but a rev: without one there is nothing
      // to read the old side from, and the working tree is the wrong answer.
      if (anchor.side === "old" && !anchor.ref) {
        report(
          "anchor_side",
          conceptId,
          `anchor ${anchor.file} is side: "old" with no ref`,
        );
      }

      if (anchor.repo && !isCanonicalRepoUrl(anchor.repo)) {
        report(
          "anchor_repo",
          conceptId,
          `anchor repo "${anchor.repo}" is not a full remote URL, so it cannot be resolved against a remote`,
          "warning",
        );
      }
    }

    // An assumption with sources is a fact that forgot to change its mind.
    if (fm.strauss_assumption && fm.sources?.length) {
      report("assumption", conceptId, "marked an assumption but cites sources");
    }
  }

  return problems;
}
