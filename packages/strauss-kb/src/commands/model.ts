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
   * Turns a result into a non-zero exit for the CLI. A check that reports a
   * problem has succeeded as a command and failed as a check, and a shell
   * caller can only see the difference through the exit code.
   */
  failsWhen?(result: unknown): boolean;
};

export const bundlePath = z
  .string()
  .min(1)
  .describe("Absolute path to the knowledge base directory.");

export const conceptId = z.string().min(1).describe("e.g. decision.cursor-v2");

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
