import { z } from "zod";
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
 * Where the code an anchor points at lives, for the drift check.
 *
 * Optional, and worth passing whenever the base is not inside the tree it
 * describes: the default is the working directory, and a bundle read from
 * elsewhere would find none of its anchored files there. (The store suppresses
 * that case rather than reporting the whole base as drifted — see
 * `KbStore.detectDrift` — but an explicit root is the answer, not the guard.)
 */
export const REPO_ROOT = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Where the anchored source lives, for the drift check. Defaults to the working directory. Anchors that carry no hash are never read, so a base nobody has stamped costs nothing here.",
  );

export function define<Shape extends z.ZodRawShape>(
  command: KbCommand<Shape>,
): KbCommand<z.ZodRawShape> {
  return command as unknown as KbCommand<z.ZodRawShape>;
}

/** The value after `--name` in argv, or undefined when the flag is absent. */
export function argvFlag(argv: string[], name: string): string | undefined {
  const at = argv.indexOf(name);
  return at !== -1 ? argv[at + 1] : undefined;
}
