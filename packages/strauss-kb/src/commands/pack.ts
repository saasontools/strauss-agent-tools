import { z } from "zod";
import type { KbWarning } from "../adjudicate.js";
import type { KbPackResult } from "../pack.js";
import { argvFlag, bundlePath, conceptId, define } from "./model.js";

export const packCommand = define({
  name: "pack",
  tool: "kb_pack",
  usage: "pack <conceptId> [--hops N] [--max-nodes N] [--budget N]",
  description:
    "Bounded neighbourhood around one record: within `hops`, ranked, cut to `maxNodes`, with every cut record named under Excluded. Use when the base is over kb_load's budget and the work centres on a record you can name. Refuses over budget rather than truncating. Everything below the header is byte-stable across runs. Resolves supersession like kb_load.",
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
  jsonRefused: true,
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
