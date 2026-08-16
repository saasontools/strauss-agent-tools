import type { KbRecord } from "./kb-record.schema.js";
import { isKbRecordType } from "./record-types.js";

export type KbValidationProblem = {
  check: string;
  conceptId: string;
  note: string;
};

/**
 * Checks that only hold across the whole bundle.
 *
 * Per-record shape is the schema's job and is enforced on every read, so
 * nothing here re-states it. What a schema cannot see is whether one record's
 * pointers agree with another's — and since `supersede()` now writes both
 * directions, a disagreement means someone edited a file by hand.
 */
export function validateBundle(records: KbRecord[]): KbValidationProblem[] {
  const byId = new Map(records.map((record) => [record.conceptId, record]));
  const problems: KbValidationProblem[] = [];
  const report = (check: string, conceptId: string, note: string) =>
    problems.push({ check, conceptId, note });

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

    // An assumption with sources is a fact that forgot to change its mind.
    if (fm.strauss_assumption && fm.sources?.length) {
      report("assumption", conceptId, "marked an assumption but cites sources");
    }
  }

  return problems;
}
