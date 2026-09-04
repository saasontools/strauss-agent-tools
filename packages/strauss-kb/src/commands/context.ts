import { z } from "zod";
import { buildContext, toHookJson } from "../kb-context.js";
import { argvFlag, define } from "./model.js";

export const contextCommand = define({
  name: "context",
  tool: "kb_context",
  usage:
    "context [--profile NAME] [--budget N] [--full-under N] [--format json] [--event NAME]",
  description:
    "Index block of pinned bases (ids, titles, standing) for injection at context birth. Takes no bundlePath — reads the workspace pin manifests. Empty when nothing is pinned; refuses over budget rather than truncating. Budget precedence: flags, then the manifest `context[profile]` over `context.default`, then the built-in profile, then package defaults.",
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
        "Named budget set: built-ins are session-start (full-under 1500), compact and turn (budget 2500); the manifests' `context` tables override per repo. Unknown names fall through to defaults rather than failing.",
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
    const budget = argvFlag(argv, "--budget");
    const fullUnder = argvFlag(argv, "--full-under");
    const profile = argvFlag(argv, "--profile");
    const format = argvFlag(argv, "--format");
    const event = argvFlag(argv, "--event");
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
      // Degradations — a full pin that could not fit, a refused block — go
      // to stderr as well as into the block itself: stderr is diagnostics on
      // both surfaces (hooks discard it, MCP logs it), so an operator can
      // see budget pressure without reading injected context.
      warn: (entry) => process.stderr.write(`${JSON.stringify(entry)}\n`),
    });
    // Empty means empty in both formats: this runs from hooks at every
    // session start and must be silent when there is nothing to say.
    if (!result.block) return "";
    return format === "json"
      ? toHookJson(result.block, event ?? "SessionStart")
      : result.block;
  },
});
