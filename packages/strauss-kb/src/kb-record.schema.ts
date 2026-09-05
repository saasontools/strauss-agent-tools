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
 * `OrderService.cancel` survives every edit that does not rename it. Once the
 * change settles, a resolution pass (`anchor-resolver/`) stamps `hash`,
 * `resolved_at`, and `lines`; drift detection later re-resolves and compares.
 *
 * `hash` is prefixed with the algorithm so a future one can coexist with
 * stored values. `lines` exists because the anchor keeps a hash, not the text:
 * without the line count at hash time, a drift report could say "changed" but
 * never how much.
 *
 * `repo` and `ref` say *which* code, for bases that describe more than one
 * repository. They are author-owned identity: a resolver stamps `hash`,
 * `lines`, and `resolved_at`, and never writes these two. Both are optional and
 * independent of each other, so every anchor written before they existed stays
 * valid.
 */

/**
 * An explicit line range, 1-based and inclusive. Author-owned: a resolver
 * hashes it but never moves it.
 */
export const kbAnchorSpanSchema = z
  .object({
    start: z.number().int().positive(),
    end: z.number().int().positive(),
  })
  .strict();

export const kbAnchorSchema = z
  .object({
    file: z.string().min(1),
    symbol: z.string().min(1).optional(),
    /**
     * The lines the concept names, when no symbol covers them — deleted code,
     * YAML, SQL, Markdown. Alternative to `symbol`, never a refinement of it.
     */
    span: kbAnchorSpanSchema.optional(),
    /**
     * Which side of the change the anchor describes. `old` is code as it was
     * committed at `ref`, which is the only way to anchor something deleted;
     * absent means the working tree.
     */
    side: z.enum(["old", "new"]).optional(),
    /**
     * Which repository the file lives in — a remote URL
     * (`https://github.com/org/name`) or a short name. Absent means the base's
     * own repository, which is what nearly every anchor means.
     *
     * Unvalidated beyond not-blank: one repository has many spellings, matched
     * after normalisation. Only a full URL can be fetched from, so `validate`
     * warns on a short one; see ARCHITECTURE.
     */
    repo: z.string().trim().min(1).optional(),
    /**
     * The git rev the evidence was taken at. Prefer a commit SHA: a branch
     * name is a moving pointer, so an anchor pinned to one says the evidence
     * came from wherever that branch happens to be now, which is not a
     * baseline. A foreign anchor is checked at this rev, and compared against
     * the remote's default branch on top of it.
     */
    ref: z.string().trim().min(1).optional(),
    hash: z
      .string()
      .regex(/^sha256:[0-9a-f]{64}$/, {
        message: "hash must be sha256:<64 hex chars>",
      })
      .optional(),
    /**
     * What `hash` was taken over: the span's raw text, or the normalised token
     * stream a parser sees (`ast`). Absent means `raw`, which is what every
     * anchor stamped before this field carries, so old hashes keep comparing
     * the way they were written. An `ast` hash is blind to whitespace and
     * comments, so reformatting the anchored code is not drift.
     */
    hash_kind: z.enum(["raw", "ast"]).optional(),
    /** ISO 8601 timestamp of the last successful resolution. */
    resolved_at: z.string().min(1).optional(),
    /** Line count of the text the hash was taken over. */
    lines: z.number().int().positive().optional(),
    /**
     * Which resolver produced the hashed span. Absent means an anchor stamped
     * before resolvers were named, which is read as `regex` — the only one
     * there was. A hash from a different resolver is drift, not a match.
     */
    resolver: z.enum(["tree-sitter", "regex", "span"]).optional(),
  })
  .strict();

/**
 * The anchor rules a resolver cannot settle for itself.
 *
 * Write-side only, like `kbVerifiedEventSchema`: the frontmatter keeps parsing
 * with `kbAnchorSchema`, so a hand-edited defect is a `kb_validate` finding
 * rather than a record that silently vanishes from `list()`.
 */
export const kbAnchorWriteSchema = kbAnchorSchema.superRefine((anchor, ctx) => {
  if (anchor.span && anchor.symbol) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["span"],
      message: "an anchor names a symbol or a span, not both",
    });
  }
  if (anchor.span && anchor.span.end < anchor.span.start) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["span", "end"],
      message: "span end must not precede start",
    });
  }
  // A span is hashed raw, so an `ast` kind on one would compare a raw hash
  // against a token-stream hash and report drift for ever.
  if (anchor.span && anchor.hash_kind === "ast") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["hash_kind"],
      message: "a span is hashed raw, never ast",
    });
  }
  if (anchor.side === "old" && !anchor.ref) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["ref"],
      message: 'side: "old" needs a ref — committed code has no other address',
    });
  }
});

/**
 * One typed causal edge, as the frontmatter stores it.
 *
 * Read-side, and therefore tolerant: `rel` is a plain string here even though
 * the vocabulary is closed, for the same reason `type` is. Rejecting an unknown
 * rel at parse time would make the file vanish from `list()`, and a bundle
 * cannot report a defect in a record it refuses to load. `kb_validate` turns an
 * unknown rel into an error; `composeRecord` stops one being written.
 *
 * `target` is likewise not required to resolve — a dangling target is a
 * validation warning rather than a parse failure.
 */
export const kbLinkSchema = z
  .object({
    target: z.string().min(1),
    rel: z.string().min(1),
  })
  .passthrough();

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

    // Typed causal edges, source → target, living on the source. `A depends_on
    // B` means A needs B, so `kb_impact` walks these inbound: what breaks if B
    // changes is whatever declared a dependence on it.
    strauss_links: z.array(kbLinkSchema).optional(),

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
export type KbAnchorSpan = z.infer<typeof kbAnchorSpanSchema>;
export type KbAnchor = z.infer<typeof kbAnchorSchema>;
export type KbLink = z.infer<typeof kbLinkSchema>;
export type KbRecordFrontmatter = z.infer<typeof kbRecordFrontmatterSchema>;

export type KbRecord = {
  /** Path minus `.md`, relative to the bundle root. OKF's concept identity. */
  conceptId: string;
  frontmatter: KbRecordFrontmatter;
  body: string;
};
