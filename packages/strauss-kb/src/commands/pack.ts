import { z } from "zod";
import type { KbWarning } from "../adjudicate.js";
import type { KbPackResult } from "../pack.js";
import { argvFlag, bundlePath, conceptId, define } from "./model.js";

export const packCommand = define({
  name: "pack",
  tool: "kb_pack",
  usage: "pack <conceptId> [--hops N] [--max-nodes N] [--budget N]",
  description:
    "The bounded neighbourhood around one record: everything within `hops` of the root, ranked and cut to `maxNodes`, with every cut record named under Excluded — a named gap is knowable, a silent one is not. Prefer this over kb_load when the base is too large to hold whole and the work centres on one record; prefer it over kb_query when the question needs the governed neighbourhood — what was settled and what binds near this record — rather than a lookup by wording. Superseded records arrive as name, replacement and date stubs exactly as kb_load emits them: their bodies no longer hold, and kb_trace has the history. Refuses outright rather than truncating when the pack would exceed its token budget — a partial pack is indistinguishable from a complete one — reporting the record count and every already-cut id so the caller can lower hops or maxNodes, or raise the budget. The header carries the bundle, root, budget and a timestamp; everything below the header is byte-identical across runs over an unchanged base, so two packs can be diffed and a changed byte means changed knowledge. This tool (with kb_load, kb_query and kb_trace) is the only supported way to read a base; a raw file read bypasses supersession resolution and returns replaced records as if current.",
  input: z.object({
    bundlePath,
    conceptId,
    hops: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("How far from the root the walk may reach. Defaults to 2."),
    maxNodes: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "How many records the pack may hold, root included. Defaults to 20.",
      ),
    budgetTokens: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Approximate token ceiling over what is actually emitted. Defaults to 25000.",
      ),
  }),
  fromArgv: (argv, path) => {
    const hops = argvFlag(argv, "--hops");
    const maxNodes = argvFlag(argv, "--max-nodes");
    const budget = argvFlag(argv, "--budget");
    return {
      bundlePath: path,
      conceptId: argv[1],
      ...(hops ? { hops: Number(hops) } : {}),
      ...(maxNodes ? { maxNodes: Number(maxNodes) } : {}),
      ...(budget ? { budgetTokens: Number(budget) } : {}),
    };
  },
  run: async (
    { store, now },
    { bundlePath: path, conceptId: root, hops, maxNodes, budgetTokens },
  ) => {
    const result = await store.pack(path, root, {
      ...(hops !== undefined ? { hops } : {}),
      ...(maxNodes !== undefined ? { maxNodes } : {}),
      ...(budgetTokens !== undefined ? { budgetTokens } : {}),
    });
    return render(result, path, now());
  },
});

/**
 * The timestamp is the header's last line and appears nowhere else, so a
 * caller can drop everything through that line and diff two packs of the same
 * base byte for byte.
 */
function render(result: KbPackResult, bundle: string, at: string): string {
  const lines = [
    `# KB Pack — ${result.root}`,
    `bundle: ${bundle}`,
    `budget: ~${result.tokensLoaded} of ${result.budgetTokens} tokens, ${result.recordCount} records`,
    `packed: ${at}`,
    "",
    `## Records (${result.records.length})`,
  ];

  for (const record of result.records) {
    lines.push(
      "",
      `### ${record.conceptId}${record.title ? ` — ${record.title}` : ""} [${record.standing}]`,
    );
    if (record.warnings.length) {
      lines.push(`warnings: ${record.warnings.map(warningLabel).join("; ")}`);
    }
    if (record.anchors.length) {
      lines.push(
        `anchors: ${record.anchors
          .map((anchor) =>
            anchor.symbol ? `${anchor.file}#${anchor.symbol}` : anchor.file,
          )
          .join(", ")}`,
      );
    }
    lines.push("", record.body.trimEnd());
  }

  if (result.superseded.length) {
    lines.push("", `## Superseded (${result.superseded.length})`);
    for (const entry of result.superseded) {
      lines.push(
        `- ${entry.conceptId} → ${
          entry.supersededBy.join(", ") || "(no surviving head)"
        }${entry.at ? ` (${entry.at})` : ""}`,
      );
    }
  }

  if (result.excluded.length) {
    lines.push("", `## Excluded (${result.excluded.length})`);
    for (const cut of result.excluded) lines.push(`- ${cut}`);
  }

  return lines.join("\n");
}

function warningLabel(warning: KbWarning): string {
  switch (warning.kind) {
    case "superseded":
      return `superseded by ${warning.by.join(", ")}`;
    case "unsettled":
      return `unsettled (${warning.status})`;
    case "broken-chain":
      return `broken chain — ${warning.missing} is not in the bundle`;
    case "chain-cycle":
      return `chain cycle through ${warning.through.join(" → ")}`;
    case "forked-chain":
      return `forked chain — heads ${warning.heads.join(", ")}`;
    case "stale":
      return `stale since ${warning.staleAfter}`;
    case "unresolved-question":
      return "unresolved question";
    default:
      return warning.kind;
  }
}
