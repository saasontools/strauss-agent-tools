import { z } from "zod";
import {
  kbAnchorSchema,
  kbConceptIdSchema,
  kbSourceSchema,
  KB_CONFIDENCES,
  KB_MATERIALITIES,
  type KbRecordFrontmatter,
  type KbRecordType,
} from "./kb-record.schema.js";
import { KB_LINK_RELS, LINK_RELS, RECORD_TYPES } from "./record-types.js";

/**
 * One typed causal edge, as a producer states it.
 *
 * Strict where `kbLinkSchema` is tolerant, and the pairing is deliberate — the
 * same split `kbVerifiedEventSchema` makes against `kbActorStampSchema`. What
 * this package writes must be inside the closed vocabulary; what it reads may
 * not be, because a foreign record has to stay loadable long enough for
 * `kb_validate` to say what is wrong with it.
 */
export const composeLinkSchema = z
  .object({
    target: kbConceptIdSchema,
    rel: z.enum(KB_LINK_RELS),
  })
  .strict();

export type ComposeLink = z.infer<typeof composeLinkSchema>;

export const composeInputSchema = z
  .object({
    slug: z.string().min(1),
    /** One line, in the reader's terms. Becomes OKF `title`. */
    title: z.string().min(1),
    /** The consequence — what breaks if this is wrong. Becomes `description`. */
    why: z.string().min(1),
    /** Keyed by section heading from the type's spec. Unknown keys rejected. */
    sections: z.record(z.string(), z.string().min(1)).optional(),
    anchors: z.array(kbAnchorSchema).optional(),
    sources: z.array(kbSourceSchema).optional(),
    /** No source exists, as a claim rather than a sentinel in `sources`. */
    assumption: z.boolean().optional(),
    /**
     * OKF `stale_after`: the absolute date this record stops being trusted.
     * Anything the outside world can change — pricing, quotas, versions,
     * reception counts — should carry one.
     */
    stale_after: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, {
        message: "stale_after must be YYYY-MM-DD",
      })
      .refine((date) => !Number.isNaN(Date.parse(date)), {
        message: "stale_after must be a real date",
      })
      .optional(),
    verify: z.array(z.string().min(1)).optional(),
    tags: z.array(z.string().min(1)).optional(),
    /** Concept ids this record relates to; rendered as body links. */
    relatedConceptIds: z.array(kbConceptIdSchema).optional(),
    /**
     * Typed causal edges, source → target: `{ target: "fact.b", rel:
     * "depends_on" }` on record A says A needs B. Stored in frontmatter and
     * also rendered as one prose sentence each, so the meaning survives a
     * reader that knows only OKF.
     *
     * The vocabulary is spelled into the description rather than restated in
     * prose beside it: `kb_schema` emits this, and a writer choosing a rel
     * reads what each one means from the same table the walk uses.
     */
    links: z
      .array(composeLinkSchema)
      .max(64)
      .optional()
      .describe(
        `Typed causal edges, source → target — a link on this record says this record <rel> the target. ${KB_LINK_RELS.map(
          (rel) => `${rel}: ${LINK_RELS[rel].purpose}`,
        ).join("; ")}.`,
      ),
    /** Concept ids this record replaces. The store settles the backlinks. */
    supersedes: z.array(kbConceptIdSchema).max(32).optional(),
    materiality: z.enum(KB_MATERIALITIES).optional(),
    confidence: z.enum(KB_CONFIDENCES).optional(),
    owner: z.string().min(1).optional(),
  })
  .strict();

export type ComposeInput = z.infer<typeof composeInputSchema>;

export type ComposedRecord = {
  type: string;
  slug: string;
  frontmatter: Omit<KbRecordFrontmatter, "type">;
  body: string;
};

/**
 * Builds one record's frontmatter and body from its type's spec.
 *
 * Edges go in the body rather than frontmatter because that is where OKF puts
 * them: consumers read markdown links as directed but untyped relationships,
 * with "the specific kind conveyed by the surrounding prose, not by the link
 * itself". Broken links are explicitly legal, which matters here — records are
 * routinely written before the ones they point at exist.
 */
export function composeRecord(
  type: KbRecordType,
  input: ComposeInput,
  writtenBy: string,
  writtenAt: string,
): ComposedRecord {
  // Parsed here rather than trusted from the caller: the CLI validates its own
  // stdin, but a library caller has no such gate, and `relatedConceptIds` is
  // interpolated into a markdown link unescaped a few lines down.
  const parsed = composeInputSchema.parse(input);
  const spec = RECORD_TYPES[type];
  const sections = parsed.sections ?? {};

  const unknown = Object.keys(sections).filter(
    (heading) => !spec.sections.includes(heading),
  );
  if (unknown.length) {
    throw new Error(
      `kb: ${type} has no section ${unknown.join(", ")} — expected one of ${spec.sections.join(", ")}`,
    );
  }

  const frontmatter: Omit<KbRecordFrontmatter, "type"> = {
    title: parsed.title,
    description: parsed.why,
    generated: { by: writtenBy, at: writtenAt },
    // Empty rather than absent: a later verification pass appends here, and an
    // empty list says "not yet verified" where a missing key would only say
    // "this producer didn't think about it".
    verified: [],
    strauss_status: spec.initialStatus,
  };
  if (parsed.stale_after) frontmatter.stale_after = parsed.stale_after;
  if (parsed.anchors?.length) frontmatter.strauss_anchors = parsed.anchors;
  if (parsed.verify?.length) frontmatter.strauss_verify = parsed.verify;
  if (parsed.tags?.length) frontmatter.tags = parsed.tags;
  if (parsed.sources?.length) frontmatter.sources = parsed.sources;
  if (parsed.assumption) frontmatter.strauss_assumption = true;
  if (parsed.materiality) frontmatter.strauss_materiality = parsed.materiality;
  if (parsed.confidence) frontmatter.strauss_confidence = parsed.confidence;
  if (parsed.owner) frontmatter.strauss_owner = parsed.owner;
  if (parsed.supersedes?.length)
    frontmatter.strauss_supersedes = parsed.supersedes;
  if (parsed.links?.length) frontmatter.strauss_links = parsed.links;

  const blocks: string[] = [];
  for (const heading of spec.sections) {
    const text = sections[heading];
    // Omitted rather than stubbed: an empty "## Evidence" reads as evidence
    // that was sought and not found.
    if (text) blocks.push(`## ${heading}\n\n${text}`);
  }
  if (!blocks.length) blocks.push(parsed.why);

  for (const related of parsed.relatedConceptIds ?? []) {
    blocks.push(`Relates to [${related}](${related}.md).`);
  }

  // One sentence per typed link, from a fixed template per rel. The frontmatter
  // is where a walk reads the edge, but frontmatter it does not recognise is
  // exactly what a plain-OKF consumer ignores — so the same claim is also
  // stated as prose around a markdown link, which is OKF's own spelling for a
  // typed relationship ("the specific kind conveyed by the surrounding prose").
  // Fixed rather than free text so the sentence cannot say something the rel
  // does not.
  for (const link of parsed.links ?? []) {
    blocks.push(
      `${LINK_RELS[link.rel].phrase} [${link.target}](${link.target}.md).`,
    );
  }

  if (parsed.sources?.length) {
    blocks.push(
      parsed.sources
        .map((source) => `[^${source.id}]: ${source.title ?? source.resource}`)
        .join("\n"),
    );
  }

  return {
    type,
    slug: parsed.slug,
    frontmatter,
    body: `${blocks.join("\n\n")}\n`,
  };
}
