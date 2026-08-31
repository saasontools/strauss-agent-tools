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

/**
 * The closed vocabulary of typed causal edges — `strauss_links[].rel`.
 *
 * Closed on purpose, and the only closed vocabulary here a producer may not
 * extend. An open rel set is a free-text field wearing a schema: two agents
 * writing `depends-on` and `dependsOn` at the same base produce a graph no walk
 * can traverse, and nothing ever reports it, because every spelling is legal.
 * Eight rels cover what a knowledge base actually needs to say about causation;
 * `related_to` is the escape hatch for everything that is a pointer rather than
 * a dependence, which is why it is the one rel `kb_impact` does not follow.
 *
 * Supersession is deliberately absent. It is a lifecycle — a record's standing
 * changes, and `strauss_supersedes`/`strauss_superseded_by` carry it in both
 * directions with the store settling the pair. Restating it as an edge would
 * give the same fact two spellings that can disagree.
 *
 * Every edge reads source → target and lives on the source's frontmatter:
 * `A depends_on B` means A needs B. `phrase` is the fixed prose template
 * compose.ts renders it with, so an OKF reader with no idea what
 * `strauss_links` is still reads the meaning out of the body.
 */
export type KbLinkRelSpec = {
  /** One line, for schema output and CLI help. */
  purpose: string;
  /** Sentence stem: `<phrase> [target](target.md).` */
  phrase: string;
  /**
   * Whether a change to the target can break the source. `kb_impact` walks
   * these inbound and transitively; the rest are pointers, not dependencies.
   */
  causal: boolean;
};

export const KB_LINK_RELS = [
  "depends_on",
  "constrains",
  "informs",
  "blocks",
  "invalidates",
  "verified_by",
  "satisfies",
  "related_to",
] as const;

export type KbLinkRel = (typeof KB_LINK_RELS)[number];

export const LINK_RELS: Readonly<Record<KbLinkRel, KbLinkRelSpec>> = {
  depends_on: {
    purpose: "The source needs the target to hold",
    phrase: "Depends on",
    causal: true,
  },
  constrains: {
    purpose: "The source bounds what the target may do",
    phrase: "Constrains",
    causal: true,
  },
  informs: {
    purpose: "The source shaped the target without binding it",
    phrase: "Informs",
    causal: true,
  },
  blocks: {
    purpose: "The target cannot proceed until the source is settled",
    phrase: "Blocks",
    causal: true,
  },
  invalidates: {
    purpose: "The source makes the target no longer hold",
    phrase: "Invalidates",
    causal: true,
  },
  verified_by: {
    purpose: "The target is the check that confirms the source",
    phrase: "Verified by",
    causal: true,
  },
  satisfies: {
    purpose: "The source discharges the target's requirement",
    phrase: "Satisfies",
    causal: true,
  },
  related_to: {
    purpose: "A pointer worth following, with no claim of dependence",
    phrase: "Relates to",
    causal: false,
  },
};

/** The rels a change can propagate along. `kb_impact`'s default edge set. */
export const KB_CAUSAL_LINK_RELS = KB_LINK_RELS.filter(
  (rel) => LINK_RELS[rel].causal,
);

export function isKbLinkRel(value: string): value is KbLinkRel {
  return Object.prototype.hasOwnProperty.call(LINK_RELS, value);
}
