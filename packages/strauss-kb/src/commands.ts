import { z } from "zod";
import { composeInputSchema, composeRecord } from "./compose.js";
import { buildContext, syncInstructions, toHookJson } from "./kb-context.js";
import { listPins, pinBase, unpinBase } from "./kb-pins.js";
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
  /**
   * MCP tool name. Absent only for CLI-only plumbing (`sync-instructions`),
   * which exists to edit files for hooks and instruction blocks rather than to
   * give an agent a capability — the capability, "get the pinned context
   * block", is `kb_context`.
   */
  tool?: string;
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
      "Load the whole knowledge base at once, each record with its standing. Prefer this over searching: these bases run to a few thousand tokens, and a reader holding all of it has perfect recall and knows why it is asking, which no ranker does. Superseded records arrive under `superseded` as name, replacement and date only — their bodies no longer hold, and reading one later in a long session is the mistake this prevents; pass the id to kb_trace when you need the history. Rejected and unresolved records arrive whole: what was turned down, and what is still open, is the part a diff cannot show you. Refuses with a count rather than truncating when the base is too large — a truncated base is indistinguishable from a complete one, and would have you conclude something was never decided from a slice you did not know was a slice. Call at the point of use, not once per session: a base loaded early is summarised away by compaction, so if the visible context holds no records from this base and the question at hand is one it might govern, load before answering — never conclude nothing was decided from a context with no KB content in it. This tool (with kb_query and kb_trace) is the only supported way to read a base; a raw file read bypasses supersession resolution and returns replaced records as if current.",
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
      "Search and return each match with its standing. Results are flagged, never filtered: a superseded record comes back alongside whatever replaced it, and a rejected one is marked as something explicitly not adopted. Prefer kb_load when the base fits its budget: on this package's measurements, a reader holding the whole base answered eight of nine questions whose wording appears in no record, where embedding search answered four. Never read record files directly — this tool (with kb_load and kb_trace) is the only supported way to read a base; a file read bypasses supersession resolution and returns replaced records as if current.",
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
      'How a position was arrived at, as a timeline ordered by when each record was written. Deliberately includes rejected, draft, and superseded records — in a history those are the content, not noise. Follows supersession, shared code anchors, and shared sources. Use when the question is "why is this the way it is" rather than "what do we hold now". This tool (with kb_load and kb_query) is the only supported way to read a base; a raw file read bypasses supersession resolution and returns replaced records as if current.',
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
      "The index, rebuilt if it disagrees with the records. One call gives the whole shape of the base: title, type, status, and description per record. The cheap re-orientation call after compaction or deep in a long session — a few hundred tokens; call it (or kb_context, when bases are pinned) first, then kb_load or fetch by concept id.",
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
    name: "pin",
    tool: "kb_pin",
    usage: "pin [bundle-path]",
    description:
      "Pin a base into this workspace's manifest (.strauss/kb-pins.json), so `context` surfaces its index at every context birth. Idempotent — pinning a pinned path changes nothing. A path with no records yet succeeds with a warning; bases are routinely pinned before they are populated. Pins are workspace state: the pinned base itself is never touched.",
    input: z.object({ bundlePath }),
    fromArgv: (argv, path) => ({ bundlePath: argv[1] ?? path }),
    run: ({ store, now }, { bundlePath: path }) =>
      pinBase(store, process.cwd(), path, now()),
  }),

  define({
    name: "unpin",
    tool: "kb_unpin",
    usage: "unpin [bundle-path]",
    description:
      "Remove a base from this workspace's pin manifest. Says whether anything was there to remove.",
    input: z.object({ bundlePath }),
    fromArgv: (argv, path) => ({ bundlePath: argv[1] ?? path }),
    run: (_ctx, { bundlePath: path }) => unpinBase(process.cwd(), path),
  }),

  define({
    name: "pins",
    tool: "kb_pins",
    usage: "pins",
    description:
      "Every pinned base, each with whether it currently resolves to readable records. Reads the workspace manifest rather than any one base, like kb_context.",
    input: z.object({}),
    fromArgv: () => ({}),
    run: ({ store }) => listPins(store, process.cwd()),
  }),

  define({
    name: "context",
    tool: "kb_context",
    usage:
      "context [--profile NAME] [--budget N] [--full-under N] [--format json] [--event NAME]",
    description:
      "The pinned-base index block, for injection at every context birth — startup, clear, resume, and after compaction. An index, not the content: concept ids, titles and standing, with the bodies left behind kb_load at the point of use. Emits nothing when nothing is pinned. Refuses with the list of bases and their sizes rather than truncating past its budget. Budgets resolve most-specific-first: explicit flags, then the workspace manifest's `context` table (per profile, over its `default`), then the built-in profile (session-start, compact, turn), then package defaults — so a repo tunes its own numbers in .strauss/kb-pins.json without touching hook commands. Like kb_schema and kb_types this takes no bundlePath — it reads the workspace pin manifest, because which bases a session should see is workspace state, not a property of one base.",
    input: z.object({
      budgetTokens: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Ceiling on the whole emitted block; past it the command refuses with a list of bases rather than truncating. Defaults to 4000.",
        ),
      fullUnderTokens: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Per-base rendering threshold, applied before the budget: a base whose complete load fits under this arrives as full records instead of index lines, and the whole block still answers to budgetTokens. Off by default — index-only is the safe default at a context birth, because injected bodies outlive the qualifiers on them; the session-start profile opts tiny bases in at 1500.",
        ),
      profile: z
        .string()
        .optional()
        .describe(
          "Named budget set: built-ins are session-start (full-under 1500), compact and turn (budget 2500); the manifest's `context` table overrides per repo. Unknown names fall through to defaults rather than failing.",
        ),
      format: z
        .enum(["markdown", "json"])
        .optional()
        .describe(
          "CLI envelope for hook protocols that require strict JSON on stdout. MCP callers omit this — the block itself is identical.",
        ),
      event: z
        .string()
        .optional()
        .describe(
          "hookEventName stamped into the JSON envelope. Only meaningful with format=json.",
        ),
    }),
    fromArgv: (argv) => {
      const flag = (name: string) => {
        const at = argv.indexOf(name);
        return at !== -1 ? argv[at + 1] : undefined;
      };
      const budget = flag("--budget");
      const fullUnder = flag("--full-under");
      const profile = flag("--profile");
      const format = flag("--format");
      const event = flag("--event");
      return {
        ...(budget ? { budgetTokens: Number(budget) } : {}),
        ...(fullUnder ? { fullUnderTokens: Number(fullUnder) } : {}),
        ...(profile ? { profile } : {}),
        ...(format ? { format } : {}),
        ...(event ? { event } : {}),
      };
    },
    run: async (
      { store },
      { budgetTokens, fullUnderTokens, profile, format, event },
    ) => {
      const result = await buildContext(store, process.cwd(), {
        ...(budgetTokens ? { budgetTokens } : {}),
        ...(fullUnderTokens ? { fullUnderTokens } : {}),
        ...(profile ? { profile } : {}),
      });
      // Empty means empty in both formats: this runs from hooks at every
      // session start and must be silent when there is nothing to say.
      if (!result.block) return "";
      return format === "json"
        ? toHookJson(result.block, event ?? "SessionStart")
        : result.block;
    },
  }),

  define({
    name: "sync-instructions",
    usage:
      "sync-instructions <file> [--profile NAME] [--budget N] [--full-under N]",
    description:
      "Idempotently plant the `context` block between sentinel comments in an instruction file (AGENTS.md, CLAUDE.md), creating the block when absent and leaving everything outside the sentinels alone. CLI-only: this is file plumbing for runtimes whose instruction files are re-read where their conversations are not, not an agent capability — the capability is kb_context.",
    input: z.object({
      file: z
        .string()
        .min(1)
        .describe("The instruction file to edit in place."),
      budgetTokens: z.number().int().positive().optional(),
      fullUnderTokens: z.number().int().positive().optional(),
      profile: z.string().optional(),
    }),
    fromArgv: (argv) => {
      const flag = (name: string) => {
        const at = argv.indexOf(name);
        return at !== -1 ? argv[at + 1] : undefined;
      };
      const budget = flag("--budget");
      const fullUnder = flag("--full-under");
      const profile = flag("--profile");
      return {
        file: argv[1],
        ...(budget ? { budgetTokens: Number(budget) } : {}),
        ...(fullUnder ? { fullUnderTokens: Number(fullUnder) } : {}),
        ...(profile ? { profile } : {}),
      };
    },
    run: async (
      { store },
      { file, budgetTokens, fullUnderTokens, profile },
    ) => {
      const result = await buildContext(store, process.cwd(), {
        ...(budgetTokens ? { budgetTokens } : {}),
        ...(fullUnderTokens ? { fullUnderTokens } : {}),
        ...(profile ? { profile } : {}),
      });
      return syncInstructions(file, result.block);
    },
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
