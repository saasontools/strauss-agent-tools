import { KB_CONCEPT_ID_PATTERN, type KbRecord } from "./kb-record.schema.js";
import { isKbLinkRel, isKbRecordType, KB_LINK_RELS } from "./record-types.js";

/**
 * Whether a finding is a defect or a note.
 *
 * `error` fails the check and the CLI's exit code with it; `warning` is
 * reported and does not. The line between them is whether the bundle is
 * currently wrong or merely incomplete: an unknown `rel` is a claim no walk can
 * ever traverse and no later write will fix, while a link to a record that does
 * not exist yet is the normal state of a base being written — records are
 * routinely written before the ones they point at.
 */
export type KbValidationSeverity = "error" | "warning";

export type KbValidationProblem = {
  check: string;
  conceptId: string;
  note: string;
  severity: KbValidationSeverity;
};

/**
 * Checks that only hold across the whole bundle.
 *
 * Per-record shape is the schema's job and is enforced on every read, so
 * nothing here re-states it. What a schema cannot see is whether one record's
 * pointers agree with another's — and since `supersede()` now writes both
 * directions, a disagreement means someone edited a file by hand.
 *
 * The typed-link checks are here rather than in the schema for a reason that
 * looks backwards until you try the alternative: a frontmatter schema that
 * rejected an unknown `rel` would make the offending file fail to parse, and a
 * file that fails to parse is skipped by `list()` — so the bundle would drop
 * the record instead of reporting it, and the writer would never learn why.
 * Tolerant read, strict write (`composeRecord`), enforced here.
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

    // An assumption with sources is a fact that forgot to change its mind.
    if (fm.strauss_assumption && fm.sources?.length) {
      report("assumption", conceptId, "marked an assumption but cites sources");
    }
  }

  return problems;
}
