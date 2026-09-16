import { z } from "zod";
import { KbMissingFlagValueError } from "../kb-errors.js";
import type { KbStore } from "../kb-store.js";

/**
 * Every operation a knowledge base exposes, defined once.
 *
 * The CLI and the MCP server are both projections of this table. Kept apart
 * they drift within a day — fourteen commands against six tools — which is the
 * same failure as a schema restated in prose beside the code that enforces it,
 * one level up. A command added to the table appears in both surfaces or in
 * neither, and a test asserts exactly that.
 *
 * The two differ only in how arguments arrive: MCP passes an object matching
 * `input`, while the CLI has to turn positional argv into the same object.
 * `fromArgv` is that adapter and is the only per-surface code a command needs.
 *
 * One file per command in this folder; `index.ts` assembles the table.
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
  /**
   * Positional argv → the same object MCP receives. `bundleExplicit` says
   * whether `--bundle` was actually passed, for the one command whose meaning
   * turns on it: `stamp` with no bundle stamps every pinned base.
   */
  fromArgv(
    argv: string[],
    bundlePath: string,
    stdin: () => Promise<string>,
    bundleExplicit?: boolean,
  ): Promise<unknown> | unknown;
  run(
    ctx: KbCommandContext,
    input: z.infer<z.ZodObject<Shape>>,
  ): Promise<unknown>;
  /**
   * A human-readable form of the result, for the CLI. Where it exists the CLI
   * prints it and `--json` asks for the machine shape instead; MCP always gets
   * the machine shape, since a tool result is parsed rather than read.
   *
   * Separate from `run` rather than rendered inside it — as `pack` does, whose
   * result *is* a document — because a command whose result is a report needs
   * both forms: the table for a person, and the object for `failsWhen` and for
   * anything downstream.
   */
  render?(result: unknown): string;
  /**
   * Refuse `--json` rather than ignoring it: this verb's result *is* a rendered
   * document — `catalog`, `pack`, `index` — so the flag has nothing to switch
   * to, and one that silently does nothing teaches a caller that it worked.
   */
  jsonRefused?: boolean;
  /**
   * Turns a result into a non-zero exit for the CLI. A check that reports a
   * problem has succeeded as a command and failed as a check, and a shell
   * caller can only see the difference through the exit code.
   *
   * The input comes too, so a command can make the exit conditional on a flag
   * the caller passed rather than on the result alone.
   */
  failsWhen?(result: unknown, input: z.infer<z.ZodObject<Shape>>): boolean;
};

export const bundlePath = z
  .string()
  .min(1)
  .describe("Absolute path to the knowledge base directory.");

export const conceptId = z.string().min(1).describe("e.g. decision.cursor-v2");

/**
 * A leading `--` in a free-text positional is a mistyped flag, never prose:
 * `no-decision --help` used to write a record whose reason was `--help`. The
 * cost is that prose genuinely opening with two dashes has to be reworded.
 */
export function looksLikeFlag(value: string): boolean {
  return value.trimStart().startsWith("--");
}

const FLAG_NOT_TEXT = "reads as a flag, not text";

/**
 * A required free-text positional. See `looksLikeFlag`. The two refusals are
 * separate messages: a caller who passed nothing and one who passed `--help`
 * have different mistakes to fix.
 */
export const FREE_TEXT = z
  .string()
  .refine((value) => value.trim().length > 0, { message: "is required" })
  .refine((value) => !looksLikeFlag(value), { message: FLAG_NOT_TEXT });

/** The same, where empty means "no filter" rather than a missing argument. */
export const OPTIONAL_FREE_TEXT = z
  .string()
  .refine((value) => !looksLikeFlag(value), { message: FLAG_NOT_TEXT });

/**
 * `kind:name` — the shape `STRAUSS_KB_ACTOR` already carries, spelled once so
 * the CLI flag and the MCP input cannot disagree on what an actor is.
 */
export const KB_ACTOR_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*:\S+$/;

export const ACTOR = z
  .string()
  .regex(KB_ACTOR_PATTERN, { message: "actor must be kind:name" })
  .optional()
  .describe("Who is writing, as kind:name. Overrides the ambient actor.");

/**
 * Who this call writes as: the per-call actor when one was passed, else the
 * ambient one (`STRAUSS_KB_ACTOR`, or the server's default). One helper, so a
 * writing command can never read the context actor by mistake.
 */
export function actorOf(
  ctx: KbCommandContext,
  input: { actor?: string },
): string {
  return input.actor ?? ctx.actor;
}

/** `--actor kind:name`, for the CLI's writing verbs. */
export function argvActor(argv: string[]): { actor?: string } {
  const actor = argvFlag(argv, "--actor");
  return actor === undefined ? {} : { actor };
}

/**
 * The tag filter every read surface shares. AND, and no vocabulary: `tags` is
 * free text in frontmatter, so matching is exact and an unknown tag is empty.
 */
export const TAGS = z
  .array(z.string().min(1))
  .optional()
  .describe(
    "Keep only records carrying every one of these frontmatter tags. Matched exactly.",
  );

/**
 * Where the code an anchor points at lives, for the drift check.
 *
 * Pass it whenever the base is not inside the tree it describes: the default is
 * the working directory, where a bundle read from elsewhere finds none of its
 * anchored files. `KbStore.detectDrift` suppresses that case rather than
 * reporting the whole base as drifted.
 */
export const REPO_ROOT = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Where the anchored source lives, for the drift check. Defaults to the working directory.",
  );

export function define<Shape extends z.ZodRawShape>(
  command: KbCommand<Shape>,
): KbCommand<z.ZodRawShape> {
  return command as unknown as KbCommand<z.ZodRawShape>;
}

/**
 * The value of `--name`, in either spelling, or undefined when it is absent.
 *
 * Both `--name value` and `--name=value` are accepted, because a caller who
 * writes the second and is silently given the default has been told the
 * opposite of what happened.
 *
 * A flag present with no value is an error rather than an absent flag, for the
 * same reason. `strauss-kb load --budget` reading past the end of argv and
 * falling back to the default would hand the caller the exact ceiling they were
 * trying to move, and a trailing typo would be indistinguishable from success.
 * Note
 * that a following token starting with `--` counts as no value: `--budget
 * --all` is a missing value, not a budget of "--all".
 */
export function argvFlag(argv: string[], name: string): string | undefined {
  const joined = argv.find((arg) => arg.startsWith(`${name}=`));
  if (joined !== undefined) {
    const value = joined.slice(name.length + 1);
    if (!value) throw new KbMissingFlagValueError(name);
    return value;
  }

  const at = argv.indexOf(name);
  if (at === -1) return undefined;

  const value = argv[at + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new KbMissingFlagValueError(name);
  }
  return value;
}

/**
 * Every value of a repeatable `--name`, in both spellings, in argv order.
 * Empty when the flag is absent; a flag with no value is an error, as above.
 */
export function argvFlags(argv: string[], name: string): string[] {
  const values: string[] = [];
  for (const [at, arg] of argv.entries()) {
    if (arg.startsWith(`${name}=`)) {
      const value = arg.slice(name.length + 1);
      if (!value) throw new KbMissingFlagValueError(name);
      values.push(value);
    } else if (arg === name) {
      const value = argv[at + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new KbMissingFlagValueError(name);
      }
      values.push(value);
    }
  }
  return values;
}

/**
 * argv with every occurrence of the named flags, and their values, removed —
 * for the verbs whose remaining words are free prose rather than positionals.
 */
export function argvWithout(argv: string[], ...names: string[]): string[] {
  const kept: string[] = [];
  for (let at = 0; at < argv.length; at += 1) {
    const arg = argv[at] as string;
    if (names.some((name) => arg.startsWith(`${name}=`))) continue;
    if (names.includes(arg)) {
      at += 1;
      continue;
    }
    kept.push(arg);
  }
  return kept;
}

/**
 * The first positional after the verb, once the named value-taking flags are
 * out of the way — so `list --tag review decision` still sees the type. Read
 * at a fixed index it would be dropped whenever a flag came first.
 */
export function argvPositional(
  argv: string[],
  ...names: string[]
): string | undefined {
  return argvWithout(argv.slice(1), ...names).find(
    (arg) => !arg.startsWith("--"),
  );
}
