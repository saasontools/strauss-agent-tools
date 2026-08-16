import { z } from "zod";
import { composeInputSchema, composeRecord } from "./compose.js";
import {
  composeDecisionRecord,
  composeNoDecisionRecord,
  decisionInputSchema,
  DECISION_TYPE,
} from "./decision-record.js";
import { kbJsonSchemas } from "./json-schema.js";
import {
  KB_RECORD_STATUSES,
  KB_RECORD_TYPES,
  type KbRecordType,
} from "./kb-record.schema.js";
import type { KbStore } from "./kb-store.js";
import { RECORD_TYPES } from "./record-types.js";
import { TRACE_EDGES } from "./trace.js";
import { validateBundle } from "./validate.js";

/**
 * Every operation a knowledge base exposes, defined once.
 *
 * The CLI and the MCP server are both projections of this list. Kept apart they
 * drift within a day — fourteen commands against six tools — which is the same
 * failure as a schema restated in prose beside the code that enforces it, one
 * level up. A command added here appears in both surfaces or in neither, and a
 * test asserts exactly that.
 *
 * The two differ only in how arguments arrive: MCP passes an object matching
 * `input`, while the CLI has to turn positional argv into the same object.
 * `fromArgv` is that adapter and is the only per-surface code a command needs.
 */
export type KbCommandContext = {
  store: KbStore;
  actor: string;
  now: () => string;
};

export type KbCommand<Shape extends z.ZodRawShape = z.ZodRawShape> = {
  /** CLI verb. */
  name: string;
  /** MCP tool name. */
  tool: string;
  /** Argument spelling for CLI usage output. */
  usage: string;
  /** Shown to an agent choosing a tool, so it carries the judgment too. */
  description: string;
  input: z.ZodObject<Shape>;
  /** Positional argv → the same object MCP receives. */
  fromArgv(
    argv: string[],
    bundlePath: string,
    stdin: () => Promise<string>,
  ): Promise<unknown> | unknown;
  run(
    ctx: KbCommandContext,
    input: z.infer<z.ZodObject<Shape>>,
  ): Promise<unknown>;
  /**
   * Turns a result into a non-zero exit for the CLI. A check that reports a
   * problem has succeeded as a command and failed as a check, and a shell
   * caller can only see the difference through the exit code.
   */
  failsWhen?(result: unknown): boolean;
};

const bundlePath = z
  .string()
  .min(1)
  .describe("Absolute path to the knowledge base directory.");

const conceptId = z.string().min(1).describe("e.g. decision.cursor-v2");

function define<Shape extends z.ZodRawShape>(
  command: KbCommand<Shape>,
): KbCommand<z.ZodRawShape> {
  return command as unknown as KbCommand<z.ZodRawShape>;
}

export const KB_COMMANDS: KbCommand<z.ZodRawShape>[] = [
  define({
    name: "write",
    tool: "kb_write",
    usage: "write <type> < record.json",
    description: [
      "Write one record. Search first — the same knowledge filed twice under different slugs is how a base rots, and a duplicate concept id is rejected rather than overwritten. Call kb_types for the sections each type accepts.",
      "",
      "Judgment the tool cannot enforce for you:",
      "- An unsourced claim is an `assumption` record with assumption: true, never a `fact` with a vague source. The distinction is what lets a later reader separate what was established from what was guessed.",
      "- When two records conflict, say so in a `risk`, an `open-question`, or a superseding `decision`. Quietly picking a winner destroys the disagreement, which is usually the useful part.",
      "- Prefer a new record over overloading an existing one, and keep each short. A record nobody finishes reading is not durable memory.",
      "- Records are never deleted; supersede instead, so the earlier reasoning stays inspectable.",
    ].join("\n"),
    input: z.object({
      bundlePath,
      type: z.enum(KB_RECORD_TYPES),
      input: composeInputSchema,
    }),
    fromArgv: async (argv, path, stdin) => ({
      bundlePath: path,
      type: argv[1],
      input: JSON.parse(await stdin()) as unknown,
    }),
    run: async ({ store, actor, now }, { bundlePath: path, type, input }) => {
      const record = await store.write(
        path,
        composeRecord(type as KbRecordType, input, actor, now()),
        actor,
      );
      return { conceptId: record.conceptId };
    },
  }),

  define({
    name: "write-decision",
    tool: "kb_write_decision",
    usage: "write-decision < decision.json",
    description: [
      "Write a decision. Takes `alternative` and `impact` as fields rather than free sections, because what was rejected is the part a later reader cannot reconstruct from the code — a heading is too easy to leave empty.",
      "",
      "What belongs in one:",
      '- Record a decision when a later reader would otherwise "simplify" the constraint away. If the diff already answers the question, there is nothing here to write.',
      "- `alternative` is what you turned down and why, not a list of everything considered.",
      "- A reference to material you read goes in `sources`; a reference to code goes in `anchors`; a reference to another record goes in `relatedConceptIds`.",
    ].join("\n"),
    input: z.object({ bundlePath, input: decisionInputSchema }),
    fromArgv: async (_argv, path, stdin) => ({
      bundlePath: path,
      input: JSON.parse(await stdin()) as unknown,
    }),
    run: async ({ store, actor, now }, { bundlePath: path, input }) => {
      const record = await store.write(
        path,
        composeDecisionRecord(input, actor, now()),
        actor,
      );
      return { conceptId: record.conceptId };
    },
  }),

  define({
    name: "no-decision",
    tool: "kb_no_decision",
    usage: "no-decision <reason...>",
    description:
      'Claim in one sentence that there was nothing to decide. Gating on "did you write a decision?" rewards writing a junk one; gating on "did you answer?" does not, so silence has to be expressible. Idempotent — restating it is not a collision.',
    input: z.object({ bundlePath, reason: z.string().min(1) }),
    fromArgv: (argv, path) => ({
      bundlePath: path,
      reason: argv.slice(1).join(" ").trim(),
    }),
    run: async ({ store, actor, now }, { bundlePath: path, reason }) => {
      const record = await store.write(
        path,
        { ...composeNoDecisionRecord(reason, actor, now()), overwrite: true },
        actor,
      );
      return { conceptId: record.conceptId };
    },
  }),

  define({
    name: "status",
    tool: "kb_status",
    usage: "status <concept-id> <status>",
    description:
      "Move a record's status, leaving everything else alone. Uses a compare-and-swap, so a concurrent change fails loudly rather than being overwritten.",
    input: z.object({
      bundlePath,
      conceptId,
      status: z.enum(KB_RECORD_STATUSES),
    }),
    fromArgv: (argv, path) => ({
      bundlePath: path,
      conceptId: argv[1],
      status: argv[2],
    }),
    run: async (
      { store, actor },
      { bundlePath: path, conceptId: id, status },
    ) => {
      const record = await store.setStatus(path, id, status, actor);
      return { conceptId: record.conceptId, status };
    },
  }),

  define({
    name: "supersede",
    tool: "kb_supersede",
    usage: "supersede <concept-id> <replacement-id>",
    description:
      "Mark a record superseded by another, linking both directions. Use this rather than editing a record whose meaning changed — a record that quietly becomes something else invalidates every reference to it, and the earlier understanding is what a later trace needs.",
    input: z.object({ bundlePath, conceptId, replacementId: conceptId }),
    fromArgv: (argv, path) => ({
      bundlePath: path,
      conceptId: argv[1],
      replacementId: argv[2],
    }),
    run: async (
      { store, actor },
      { bundlePath: path, conceptId: id, replacementId },
    ) => {
      await store.supersede(path, id, replacementId, actor);
      return { superseded: id, replacedBy: replacementId };
    },
  }),

  define({
    name: "answer",
    tool: "kb_answer",
    usage: "answer <concept-id> <answer...>",
    description:
      "Resolve an open question: sets the status, stamps who answered and when, and appends an Answer section. If the answer overturns an assumption or a decision, that is a supersession — do it explicitly.",
    input: z.object({ bundlePath, conceptId, answer: z.string().min(1) }),
    fromArgv: (argv, path) => ({
      bundlePath: path,
      conceptId: argv[1],
      answer: argv.slice(2).join(" ").trim(),
    }),
    run: async (
      { store, actor },
      { bundlePath: path, conceptId: id, answer },
    ) => {
      const record = await store.answer(path, id, answer, actor);
      return { conceptId: record.conceptId };
    },
  }),

  define({
    name: "load",
    tool: "kb_load",
    usage: "load [type] [--budget N]",
    description:
      "Load the whole knowledge base at once, each record with its standing. Prefer this over searching: these bases run to a few thousand tokens, and a reader holding all of it has perfect recall and knows why it is asking, which no ranker does. Superseded records arrive under `superseded` as name, replacement and date only — their bodies no longer hold, and reading one later in a long session is the mistake this prevents; pass the id to kb_trace when you need the history. Rejected and unresolved records arrive whole: what was turned down, and what is still open, is the part a diff cannot show you. Refuses with a count rather than truncating when the base is too large — a truncated base is indistinguishable from a complete one, and would have you conclude something was never decided from a slice you did not know was a slice.",
    input: z.object({
      bundlePath,
      type: z.enum(KB_RECORD_TYPES).optional(),
      budgetTokens: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Approximate token ceiling. Defaults to 25000."),
    }),
    fromArgv: (argv, path) => {
      const at = argv.indexOf("--budget");
      return {
        bundlePath: path,
        ...(argv[1] && argv[1] !== "--budget" ? { type: argv[1] } : {}),
        ...(at !== -1 && argv[at + 1]
          ? { budgetTokens: Number(argv[at + 1]) }
          : {}),
      };
    },
    run: async ({ store }, { bundlePath: path, type, budgetTokens }) => {
      const result = await store.load(path, {
        ...(type ? { type } : {}),
        ...(budgetTokens ? { budgetTokens } : {}),
      });
      if (!result.loaded) return result;
      return {
        ...result,
        records: result.records.map((hit) => ({
          conceptId: hit.record.conceptId,
          title: hit.record.frontmatter.title ?? null,
          standing: hit.standing,
          supersededBy: hit.heads.map((head) => head.conceptId),
          warnings: hit.warnings,
          anchors: hit.record.frontmatter.strauss_anchors ?? [],
          body: hit.record.body,
        })),
      };
    },
  }),

  define({
    name: "query",
    tool: "kb_query",
    usage: "query <text...>",
    description:
      "Search and return each match with its standing. Results are flagged, never filtered: a superseded record comes back alongside whatever replaced it, and a rejected one is marked as something explicitly not adopted. Prefer this over reading record files directly — relevance and standing are different questions, and a bare match answers only the first.",
    input: z.object({
      bundlePath,
      text: z.string().optional(),
      type: z.enum(KB_RECORD_TYPES).optional(),
      includeNonCurrent: z.boolean().optional(),
    }),
    fromArgv: (argv, path) => ({
      bundlePath: path,
      text: argv.slice(1).join(" ").trim(),
      includeNonCurrent: true,
    }),
    run: async (
      { store },
      { bundlePath: path, text, type, includeNonCurrent },
    ) =>
      (
        await store.query(path, text ?? "", {
          ...(type ? { type } : {}),
          includeNonCurrent: includeNonCurrent === true,
        })
      ).map((hit) => ({
        conceptId: hit.record.conceptId,
        title: hit.record.frontmatter.title ?? null,
        description: hit.record.frontmatter.description ?? null,
        standing: hit.standing,
        supersededBy: hit.heads.map((head) => head.conceptId),
        warnings: hit.warnings,
        body: hit.record.body,
      })),
  }),

  define({
    name: "trace",
    tool: "kb_trace",
    usage: "trace <concept-id> [edges...]",
    description:
      'How a position was arrived at, as a timeline ordered by when each record was written. Deliberately includes rejected, draft, and superseded records — in a history those are the content, not noise. Follows supersession, shared code anchors, and shared sources. Use when the question is "why is this the way it is" rather than "what do we hold now".',
    input: z.object({
      bundlePath,
      conceptId,
      edges: z.array(z.enum(TRACE_EDGES)).optional(),
      depth: z.number().int().positive().optional(),
    }),
    fromArgv: (argv, path) => ({
      bundlePath: path,
      conceptId: argv[1],
      edges: argv
        .slice(2)
        .filter((edge) => (TRACE_EDGES as readonly string[]).includes(edge)),
    }),
    run: async ({ store }, { bundlePath: path, conceptId: id, edges, depth }) =>
      (
        await store.trace(path, id, {
          ...(edges?.length ? { edges } : {}),
          ...(depth ? { depth } : {}),
        })
      ).map((step) => ({
        conceptId: step.record.conceptId,
        at: step.record.frontmatter.generated?.at ?? null,
        status: step.record.frontmatter.strauss_status,
        title: step.record.frontmatter.title ?? null,
        depth: step.depth,
        via: step.via,
        body: step.record.body,
      })),
  }),

  define({
    name: "list",
    tool: "kb_list",
    usage: "list [type]",
    description:
      "Every record, optionally narrowed to one type. Use kb_query when you have a question; this is for enumerating.",
    input: z.object({ bundlePath, type: z.enum(KB_RECORD_TYPES).optional() }),
    fromArgv: (argv, path) => ({ bundlePath: path, type: argv[1] }),
    run: async ({ store }, { bundlePath: path, type }) =>
      (await store.list(path, type)).map((record) => ({
        conceptId: record.conceptId,
        title: record.frontmatter.title ?? null,
        description: record.frontmatter.description ?? null,
        status: record.frontmatter.strauss_status,
        anchors: record.frontmatter.strauss_anchors ?? [],
      })),
  }),

  define({
    name: "index",
    tool: "kb_index",
    usage: "index",
    description:
      "The index, rebuilt if it disagrees with the records. One call gives the whole shape of the base: title, type, status, and description per record.",
    input: z.object({ bundlePath }),
    fromArgv: (_argv, path) => ({ bundlePath: path }),
    run: ({ store }, { bundlePath: path }) => store.readIndex(path),
  }),

  define({
    name: "log",
    tool: "kb_log",
    usage: "log",
    description:
      "What touched what, and when. The only artifact here that cannot be reconstructed from the records, so malformed lines are reported rather than repaired.",
    input: z.object({ bundlePath }),
    fromArgv: (_argv, path) => ({ bundlePath: path }),
    run: ({ store }, { bundlePath: path }) => store.readLog(path),
  }),

  define({
    name: "validate",
    tool: "kb_validate",
    usage: "validate",
    description:
      "Check pointers no single record can see: supersession links that disagree between the two records, and assumptions that cite sources. Per-record shape is enforced on every read, so a problem here means someone edited a file by hand.",
    input: z.object({ bundlePath }),
    fromArgv: (_argv, path) => ({ bundlePath: path }),
    run: async ({ store }, { bundlePath: path }) =>
      validateBundle(await store.list(path)),
    failsWhen: (result) => Array.isArray(result) && result.length > 0,
  }),

  define({
    name: "schema",
    tool: "kb_schema",
    usage: "schema",
    description:
      "JSON Schema for the frontmatter, the write input, and log entries — generated from the code that enforces them, so it cannot drift from what a write will accept.",
    input: z.object({}),
    fromArgv: () => ({}),
    run: () => Promise.resolve(kbJsonSchemas()),
  }),

  define({
    name: "types",
    tool: "kb_types",
    usage: "types",
    description:
      "The twelve record types with their purpose, body sections, and starting status. Read this before writing rather than guessing headings — a section the type does not define is rejected.",
    input: z.object({}),
    fromArgv: () => ({}),
    run: () => Promise.resolve(RECORD_TYPES),
  }),
];

export const KB_COMMANDS_BY_NAME = new Map(
  KB_COMMANDS.map((command) => [command.name, command]),
);

export { DECISION_TYPE };
