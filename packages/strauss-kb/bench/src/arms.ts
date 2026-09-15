import type { ArmId, BenchRecord } from "./model.js";

/**
 * The instruction arm B carries in place of the standing fields.
 *
 * Worded the way a careful engineer would word it, not the way that would make
 * the fields look good.
 */
export const CAREFUL_INSTRUCTION =
  "Be careful: these notes were written over many months and were never " +
  "reconciled. Some of them are stale, and some describe decisions that were " +
  "later reversed. Work out what currently holds before you answer.";

export type ArmSpec = {
  id: ArmId;
  label: string;
  /** One line, for the results table. */
  description: string;
  /** Render `status`, `materiality`, `confidence` -- the trust fields. */
  standing: boolean;
  /** Render `supersedes` / `superseded_by`, and stub what no longer stands. */
  supersessionLinks: boolean;
  instruction: string | null;
};

export const ARMS: Readonly<Record<ArmId, ArmSpec>> = {
  A: {
    id: "A",
    label: "flagged standing",
    description: "standing fields + supersession links + superseded stubs",
    standing: true,
    supersessionLinks: true,
    instruction: null,
  },
  B: {
    id: "B",
    label: "untyped + instruction",
    description: 'standing stripped, "be careful about stale notes" added',
    standing: false,
    supersessionLinks: false,
    instruction: CAREFUL_INSTRUCTION,
  },
  C: {
    id: "C",
    label: "untyped",
    description: "standing stripped, no instruction",
    standing: false,
    supersessionLinks: false,
    instruction: null,
  },
  D: {
    id: "D",
    label: "trust fields only",
    description: "standing fields kept, supersession links removed",
    standing: true,
    supersessionLinks: false,
    instruction: null,
  },
};

export const ARM_IDS: readonly ArmId[] = ["A", "B", "C", "D"];

/** One record as an arm presents it: header fields plus a body, or a stub. */
export type ArmRecord = {
  conceptId: string;
  /** Ordered `label: value` pairs rendered above the body. */
  fields: Array<[string, string]>;
  /** `null` when the arm withholds the body because the record is superseded. */
  body: string | null;
};

export type ArmBundle = {
  arm: ArmId;
  records: ArmRecord[];
  instruction: string | null;
};

/**
 * Projects the arm-A bundle into one arm's view: same records, same order,
 * same bytes for the same input. Only the header fields and the presence of a
 * body differ.
 */
export function applyArm(records: BenchRecord[], arm: ArmId): ArmBundle {
  const spec = ARMS[arm];
  const ordered = [...records].sort((a, b) =>
    a.conceptId.localeCompare(b.conceptId),
  );

  const armRecords = ordered.map((record): ArmRecord => {
    const fields: Array<[string, string]> = [
      ["type", record.type],
      ["title", record.title],
    ];
    if (record.recordedAt) fields.push(["recorded", record.recordedAt]);
    if (record.owner) fields.push(["author", record.owner]);

    if (spec.standing) {
      fields.push(["status", record.status]);
      if (record.materiality) fields.push(["materiality", record.materiality]);
      if (record.confidence) fields.push(["confidence", record.confidence]);
      // The answered stamp is a trust field, but its `by` is a link, so arm D
      // keeps the stamp and drops the target.
      if (record.answeredAt) {
        fields.push([
          "answered",
          spec.supersessionLinks && record.answeredBy
            ? `${record.answeredAt} by ${record.answeredBy}`
            : record.answeredAt,
        ]);
      }
    }

    if (spec.supersessionLinks) {
      if (record.supersedes.length) {
        fields.push(["supersedes", record.supersedes.join(", ")]);
      }
      if (record.supersededBy) {
        fields.push(["superseded_by", record.supersededBy]);
      }
    }

    // Only arm A can stub: a stub is the supersession link doing its work.
    const stubbed =
      spec.supersessionLinks &&
      record.status === "superseded" &&
      record.supersededBy !== null;

    return {
      conceptId: record.conceptId,
      fields,
      body: stubbed ? null : record.body,
    };
  });

  return { arm, records: armRecords, instruction: spec.instruction };
}
