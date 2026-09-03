import { z } from "zod";
import { buildContext, syncInstructions } from "../kb-context.js";
import { argvFlag, define } from "./model.js";

export const syncInstructionsCommand = define({
  name: "sync-instructions",
  usage:
    "sync-instructions <file> [--profile NAME] [--budget N] [--full-under N]",
  description:
    "CLI-only: plant the kb_context block between sentinel comments in AGENTS.md or CLAUDE.md, idempotently.",
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
