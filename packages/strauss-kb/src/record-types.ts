import type { KbRecordStatus, KbRecordType } from "./kb-record.schema.js";

/**
 * What each record type is for, and the shape of its body.
 *
 * A table rather than twelve composer modules. The types differ only in which
 * questions their body answers and where they start in the lifecycle; encoding
 * that as data keeps the one composer honest and makes adding a type an edit
 * rather than a file.
 *
 * `sections` are ordered. A section the caller leaves empty is omitted rather
 * than rendered with a placeholder — an empty "## Evidence" reads as evidence
 * that was looked for and not found.
 */
export type KbRecordTypeSpec = {
  /** One line, for `INDEX.md` legends and CLI help. */
  purpose: string;
  /** Ordered body headings. The first is the record's central claim. */
  sections: readonly string[];
  /** Where a freshly written record of this type starts. */
  initialStatus: KbRecordStatus;
};

export const RECORD_TYPES: Readonly<Record<KbRecordType, KbRecordTypeSpec>> = {
  fact: {
    purpose: "Observed or sourced fact",
    sections: ["Claim", "Evidence", "Implication"],
    initialStatus: "accepted",
  },
  requirement: {
    purpose: "Required behavior or outcome",
    sections: ["Claim", "Evidence", "Implication"],
    initialStatus: "proposed",
  },
  constraint: {
    purpose: "Limitation, compatibility boundary, policy, or restriction",
    sections: ["Claim", "Evidence", "Implication"],
    initialStatus: "accepted",
  },
  decision: {
    purpose: "Chosen or proposed direction",
    sections: ["Decision", "Rationale", "Rejected", "Impact"],
    initialStatus: "accepted",
  },
  assumption: {
    purpose: "Unsourced or not-yet-confirmed working assumption",
    sections: ["Claim", "Why we think so", "What would falsify it"],
    initialStatus: "draft",
  },
  "open-question": {
    purpose: "Question needing resolution",
    sections: ["Question", "Why it matters", "Default assumption"],
    initialStatus: "open",
  },
  risk: {
    purpose: "Something that can go wrong",
    sections: ["Risk", "Why it matters", "Mitigation", "Verification"],
    initialStatus: "open",
  },
  contract: {
    purpose: "API, data, event, schema, or permission contract",
    sections: ["Contract", "Producer", "Consumer", "Compatibility"],
    initialStatus: "proposed",
  },
  flow: {
    purpose: "Sequence, lifecycle, or state behavior",
    sections: ["Flow", "Trigger", "Steps", "Failure modes"],
    initialStatus: "accepted",
  },
  "affected-system": {
    purpose: "Component, service, package, integration, or external system",
    sections: ["System", "How it is affected", "Blast radius"],
    initialStatus: "accepted",
  },
  "test-obligation": {
    purpose: "Behavior or contract that must be verified",
    sections: ["Obligation", "Why it matters", "How to verify"],
    initialStatus: "open",
  },
  "source-note": {
    purpose: "Extracted note from source material",
    sections: ["Note", "Where it came from"],
    initialStatus: "accepted",
  },
};

export function isKbRecordType(value: string): value is KbRecordType {
  return Object.prototype.hasOwnProperty.call(RECORD_TYPES, value);
}
