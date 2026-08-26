import { z } from "zod";

/**
 * Knowledge records, shaped as OKF v0.2 concepts.
 *
 * OKF (Google Cloud `knowledge-catalog`) requires exactly one key — `type` —
 * and explicitly permits extension: "Producers MAY include any additional keys.
 * Consumers SHOULD preserve unknown keys when round-tripping and MUST NOT
 * reject documents with unrecognized fields."
 *
 * A record's identity is its `concept_id`: the file path within the bundle with
 * `.md` removed. `<type>.<slug>.md` therefore yields `decision.some-slug`.
 *
 * Keys prefixed `strauss_` are this package's extensions rather than
 * conformance, and are namespaced so a later OKF version defining the same
 * names cannot collide: OKF names files through path-valued `resource` fields
 * and has no notion of a span, so anchoring a concept to a range of code has no
 * standard spelling, and standing has none either.
 */

/** A source the record draws on. Footnotes in the body key to `id`. */
export const kbSourceSchema = z
  .object({
    id: z.string().min(1),
    resource: z.string().min(1),
    title: z.string().min(1).optional(),
    author: z.string().min(1).optional(),
    last_modified: z.string().min(1).optional(),
  })
  .passthrough();

/** An actor/time pair — OKF's shape for both `generated` and `verified[]`. */
export const kbActorStampSchema = z
  .object({
    by: z.string().min(1),
    at: z.string().min(1),
  })
  .passthrough();

/**
 * A `verified[]` event as this package writes one: the actor stamp plus a
 * required note saying what the check found. Write-side only — the frontmatter
 * keeps reading `verified` with `kbActorStampSchema`, because OKF-native
 * entries carry no note and a consumer must not reject conformant records.
 */
export const kbVerifiedEventSchema = kbActorStampSchema.extend({
  note: z.string().refine((s) => s.trim().length > 0, {
    message: "note must say what the check found",
  }),
});

/**
 * Where a record attaches in the code.
 *
 * Symbolic on purpose. These are written while the code is still moving: a
 * `line: 379` recorded at minute five is wrong by minute forty, but
 * `OrderService.cancel` survives every edit that does not rename it. A later
 * pass resolves symbols to line ranges once the change has settled, and records
 * that resolution as a `verified[]` entry.
 */
export const kbAnchorSchema = z
  .object({
    file: z.string().min(1),
    symbol: z.string().min(1).optional(),
  })
  .strict();

export const KB_RECORD_TYPES = [
  "fact",
  "requirement",
  "constraint",
  "decision",
  "assumption",
  "open-question",
  "risk",
  "contract",
  "flow",
  "affected-system",
  "test-obligation",
  "source-note",
] as const;

export type KbRecordType = (typeof KB_RECORD_TYPES)[number];

/** Both halves of `<type>.<slug>` are kebab-case, and neither may be empty. */
export const KB_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const KB_CONCEPT_ID_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Concept ids are rendered into markdown links unescaped, so an id carrying a
 * `]` or `)` would emit a broken edge rather than fail. Validating at the entry
 * point keeps the renderer from having to care.
 */
export const kbConceptIdSchema = z.string().regex(KB_CONCEPT_ID_PATTERN, {
  message: "concept id must be <type>.<slug>, both kebab-case",
});

/**
 * Standing, not freshness.
 *
 * OKF's `verified[]` and `stale_after` answer "is this still true?"; nothing in
 * the spec answers "is this settled, and does it still apply?". A base
 * supersedes its own conclusions as work proceeds, so that second question
 * needs an answer, and it is this package's to define — hence `strauss_`.
 */
export const KB_RECORD_STATUSES = [
  "draft",
  "proposed",
  "accepted",
  "open",
  "resolved",
  "rejected",
  "superseded",
] as const;

export type KbRecordStatus = (typeof KB_RECORD_STATUSES)[number];

export const KB_MATERIALITIES = [
  "blocking",
  "important",
  "non-blocking",
] as const;
export const KB_CONFIDENCES = ["low", "medium", "high"] as const;

export const kbRecordFrontmatterSchema = z
  .object({
    // OKF: the only always-required key. A concept carrying just `type` is
    // fully conformant, so everything below stays optional.
    type: z.string().min(1),

    // OKF recommended.
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    resource: z.string().min(1).optional(),
    tags: z.array(z.string()).optional(),

    // OKF optional: provenance and freshness.
    sources: z.array(kbSourceSchema).optional(),
    generated: kbActorStampSchema.optional(),
    verified: z.array(kbActorStampSchema).optional(),
    stale_after: z.string().min(1).optional(),

    // strauss extensions — see the module comment.
    strauss_anchors: z.array(kbAnchorSchema).optional(),
    strauss_verify: z.array(z.string().min(1)).optional(),

    // Total after parsing, tolerant before it. Our producers must supply a
    // status — an absent one would leave every reader inventing its own default
    // — but OKF calls a concept carrying only `type` fully conformant, so
    // rejecting a foreign record for the lack of one would put us outside the
    // spec. The default resolves it in the single place that can: here.
    strauss_status: z.enum(KB_RECORD_STATUSES).default("draft"),
    strauss_supersedes: z.array(z.string().min(1)).optional(),
    strauss_superseded_by: z.string().min(1).optional(),
    strauss_answered: kbActorStampSchema.optional(),
    strauss_materiality: z.enum(KB_MATERIALITIES).optional(),
    strauss_confidence: z.enum(KB_CONFIDENCES).optional(),
    strauss_owner: z.string().min(1).optional(),

    // "No source exists" as a field rather than a sentinel entry inside
    // `sources`. A sentinel in a reference list is a value doing work a field
    // should do; as a field, `sources` may be legitimately empty.
    strauss_assumption: z.boolean().optional(),
  })
  // Unknown keys are kept rather than stripped: OKF requires consumers to
  // preserve them when round-tripping, and a producer we don't know about may
  // be writing into the same bundle.
  .passthrough();

export type KbSource = z.infer<typeof kbSourceSchema>;
export type KbActorStamp = z.infer<typeof kbActorStampSchema>;
export type KbVerifiedEvent = z.infer<typeof kbVerifiedEventSchema>;
export type KbAnchor = z.infer<typeof kbAnchorSchema>;
export type KbRecordFrontmatter = z.infer<typeof kbRecordFrontmatterSchema>;

export type KbRecord = {
  /** Path minus `.md`, relative to the bundle root. OKF's concept identity. */
  conceptId: string;
  frontmatter: KbRecordFrontmatter;
  body: string;
};
