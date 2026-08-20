import { z } from "zod";
import { buildContext, syncInstructions } from "../kb-context.js";
import { argvFlag, define } from "./model.js";

export const syncInstructionsCommand = define({
  name: "sync-instructions",
  usage:
    "sync-instructions <file> [--profile NAME] [--budget N] [--full-under N]",
  description:
    "Idempotently plant the `context` block between sentinel comments in an instruction file (AGENTS.md, CLAUDE.md), creating the block when absent and leaving everything outside the sentinels alone. CLI-only: this is file plumbing for runtimes whose instruction files are re-read where their conversations are not, not an agent capability — the capability is kb_context.",
  input: z.object({
    file: z.string().min(1).describe("The instruction file to edit in place."),
    budgetTokens: z.number().int().positive().optional(),
    fullUnderTokens: z.number().int().positive().optional(),
    profile: z.string().optional(),
  }),
  fromArgv: (argv) => {
    const budget = argvFlag(argv, "--budget");
    const fullUnder = argvFlag(argv, "--full-under");
    const profile = argvFlag(argv, "--profile");
    return {
      file: argv[1],
      ...(budget ? { budgetTokens: Number(budget) } : {}),
      ...(fullUnder ? { fullUnderTokens: Number(fullUnder) } : {}),
      ...(profile ? { profile } : {}),
    };
  },
  run: async ({ store }, { file, budgetTokens, fullUnderTokens, profile }) => {
    const result = await buildContext(store, process.cwd(), {
      ...(budgetTokens ? { budgetTokens } : {}),
      ...(fullUnderTokens ? { fullUnderTokens } : {}),
      ...(profile ? { profile } : {}),
      warn: (entry) => process.stderr.write(`${JSON.stringify(entry)}\n`),
    });
    return syncInstructions(file, result.block);
  },
});
