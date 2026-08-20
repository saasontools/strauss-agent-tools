import { readFile, writeFile } from "node:fs/promises";
import { adjudicate } from "./adjudicate.js";
import { renderIndexLine } from "./kb-index.js";
import {
  contextProfileBudgets,
  KbPinsMalformedError,
  resolvePinPath,
  readPinsManifest,
  type KbContextBudgets,
} from "./kb-pins.js";
import type { KbStore } from "./kb-store.js";

/**
 * The context block: an index of every pinned base, emitted at context birth.
 *
 * Two failure modes lose a knowledge base to a long session — attention decay,
 * and compaction, which summarises away both loaded records and the early
 * instruction that said to consult them. This block is the layer against both:
 * small enough to re-inject at every session start, and self-instructing, so a
 * re-injection after compaction reads as a refresh rather than a contradiction.
 *
 * It is an index, not the content: concept ids, titles and standing. The
 * bodies stay behind the tools, loaded at the point of use.
 */

/** A stable heading, so re-injection reads as a refresh. */
const HEADING = "## Knowledge bases (pinned)";

/**
 * Small by design — this block is paid at every context birth, and on some
 * runtimes on every turn. A base wanting more space is `--full-under`'s job.
 */
const DEFAULT_CONTEXT_BUDGET = 4_000;

/**
 * What the hooks ask for by name, so the numbers live in one place and a repo
 * can override them in its pin manifest rather than editing hook commands.
 * `session-start` is a fresh window — room for tiny bases to arrive whole.
 * `compact` competes with a summary for a smaller window — index only.
 * `turn` is per-turn injection (Antigravity) — same tight stance as compact.
 */
export const CONTEXT_PROFILES: Record<string, KbContextBudgets> = {
  "session-start": { fullUnderTokens: 1_500 },
  compact: { budgetTokens: 2_500 },
  turn: { budgetTokens: 2_500 },
};

export type KbContextOptions = {
  /** Refuse past this. Defaults to 4000 tokens. */
  budgetTokens?: number;
  /** Emit bases whose full `load` fits under this as records, not index. 0 = off. */
  fullUnderTokens?: number;
  /**
   * A named budget set. Resolution, most specific wins: explicit options,
   * then the manifest's `context[profile]` over its `context.default`, then
   * the built-in profile, then the package defaults. An unknown profile is
   * not an error — it simply falls through; hooks must never break over a
   * name.
   */
  profile?: string;
};

export type KbContextResult = {
  /** The markdown block. Empty when there are no pins — silence, not a stub. */
  block: string;
  /** Refused: over budget. The block then lists the bases instead of the index. */
  refused: boolean;
  approxTokens: number;
  budgetTokens: number;
  bases: { path: string; absolutePath: string; approxTokens: number }[];
};

/** The crude estimator everything here shares — see kb-store.ts on why. */
function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function preamble(): string {
  return [
    HEADING,
    "",
    "What follows is an index of this workspace's pinned knowledge bases —",
    "concept ids, titles and standing only. The record bodies are NOT in this",
    "context.",
    "",
    "Consult records only through the strauss-kb MCP tools: `kb_load` (the",
    "preferred first call), `kb_query`, and `kb_trace`, passing the",
    "`bundlePath` listed with each base. Do not read record files directly:",
    "a raw file read bypasses supersession resolution, and a superseded or",
    "rejected record file reads exactly like a current one — only the store",
    "resolves chains and standing.",
    "",
    "KB content loaded earlier in a long session may have been compacted",
    "away. Before answering a question one of these bases governs, load it",
    "again at the point of use — reloading a small base costs a few thousand",
    "tokens.",
  ].join("\n");
}

type BaseSection = {
  path: string;
  absolutePath: string;
  body: string;
  mode: "index" | "full" | "empty";
};

async function renderBase(
  store: KbStore,
  path: string,
  absolutePath: string,
  fullUnderTokens: number,
): Promise<BaseSection> {
  const bundle = await store.list(absolutePath);
  if (bundle.length === 0) {
    return {
      path,
      absolutePath,
      mode: "empty",
      body: "No readable records yet — pinned ahead of being populated.",
    };
  }

  if (fullUnderTokens > 0) {
    const full = await store.load(absolutePath, {
      budgetTokens: fullUnderTokens,
    });
    if (full.loaded) {
      const records = full.records.map((hit) =>
        [
          `#### ${hit.record.conceptId} — ${hit.record.frontmatter.title ?? "(untitled)"} (${hit.standing})`,
          "",
          hit.record.body.trim(),
        ].join("\n"),
      );
      const superseded = full.superseded.map(
        (entry) =>
          `- \`${entry.conceptId}\` → superseded by ${entry.supersededBy.map((id) => `\`${id}\``).join(", ") || "(missing replacement)"}`,
      );
      return {
        path,
        absolutePath,
        mode: "full",
        body: [
          ...records,
          ...(superseded.length
            ? [
                "#### Superseded (bodies withheld — kb_trace reaches them)",
                ...superseded,
              ]
            : []),
        ].join("\n\n"),
      };
    }
  }

  // Adjudicated against the whole base so a superseded record collapses to an
  // id and its replacement — the same shape `load` hands back, for the same
  // reason: a body outlives the qualifier that said it no longer holds.
  const adjudicated = adjudicate(bundle, bundle);
  const lines = adjudicated
    .filter((hit) => hit.standing !== "superseded")
    .map((hit) => renderIndexLine(hit.record));
  const superseded = adjudicated
    .filter((hit) => hit.standing === "superseded")
    .map(
      (hit) =>
        `- \`${hit.record.conceptId}\` → superseded by ${hit.heads.map((head) => `\`${head.conceptId}\``).join(", ") || "(missing replacement)"}`,
    );
  return {
    path,
    absolutePath,
    mode: "index",
    body: [...lines, ...superseded].join("\n"),
  };
}

/**
 * Builds the block, or a refusal that lists the bases — never a truncation. A
 * truncated index is indistinguishable from a complete one, so a reader would
 * take a slice for the whole, which is `load`'s argument one layer up.
 */
export async function buildContext(
  store: KbStore,
  workspaceDir: string,
  options: KbContextOptions = {},
): Promise<KbContextResult> {
  const builtin = options.profile
    ? (CONTEXT_PROFILES[options.profile] ?? {})
    : {};
  let budgetTokens =
    options.budgetTokens ?? builtin.budgetTokens ?? DEFAULT_CONTEXT_BUDGET;
  let fullUnderTokens = options.fullUnderTokens ?? builtin.fullUnderTokens ?? 0;

  let manifest;
  try {
    manifest = await readPinsManifest(workspaceDir);
  } catch (error) {
    // Read-only and run from hooks at every session start: a malformed
    // manifest must degrade to silence there, not to a stack trace injected
    // into a fresh context. `pins` is the command that surfaces the problem.
    if (error instanceof KbPinsMalformedError) {
      return {
        block: "",
        refused: false,
        approxTokens: 0,
        budgetTokens,
        bases: [],
      };
    }
    throw error;
  }

  // The repo's own numbers, from the manifest — above the built-ins, below
  // anything passed explicitly.
  const fromManifest = contextProfileBudgets(manifest, options.profile);
  budgetTokens =
    options.budgetTokens ??
    fromManifest.budgetTokens ??
    builtin.budgetTokens ??
    DEFAULT_CONTEXT_BUDGET;
  fullUnderTokens =
    options.fullUnderTokens ??
    fromManifest.fullUnderTokens ??
    builtin.fullUnderTokens ??
    0;
  if (manifest.pins.length === 0) {
    return {
      block: "",
      refused: false,
      approxTokens: 0,
      budgetTokens,
      bases: [],
    };
  }

  const sections = await Promise.all(
    manifest.pins.map((pin) =>
      renderBase(
        store,
        pin.path,
        resolvePinPath(workspaceDir, pin.path),
        fullUnderTokens,
      ),
    ),
  );

  const modeLabel = {
    index: "index only — record bodies are not here",
    full: "full records — this base fits whole",
    empty: "empty",
  } as const;

  const rendered = sections.map((section) =>
    [
      `### ${section.path} (${modeLabel[section.mode]})`,
      "",
      `bundlePath: \`${section.absolutePath}\``,
      "",
      section.body,
    ].join("\n"),
  );

  const block = [preamble(), "", rendered.join("\n\n"), ""].join("\n");
  const bases = sections.map((section) => ({
    path: section.path,
    absolutePath: section.absolutePath,
    approxTokens: approxTokens(section.body),
  }));
  const total = approxTokens(block);

  if (total > budgetTokens) {
    const refusal = [
      HEADING,
      "",
      `The pinned index runs to ~${total} tokens, past the ${budgetTokens}-token`,
      "budget, and was not emitted — a truncated index is indistinguishable",
      "from a complete one. The pinned bases, for the strauss-kb tools",
      "(`kb_index` for one base's shape, `kb_load` for its records):",
      "",
      ...bases.map(
        (base) =>
          `- ${base.path} — ~${base.approxTokens} tokens (bundlePath: \`${base.absolutePath}\`)`,
      ),
      "",
    ].join("\n");
    return {
      block: refusal,
      refused: true,
      approxTokens: total,
      budgetTokens,
      bases,
    };
  }

  return { block, refused: false, approxTokens: total, budgetTokens, bases };
}

/**
 * The same block in the envelope hook protocols that demand strict JSON on
 * stdout require:
 * those protocols treat non-JSON stdout as a violation, where Claude Code and
 * Codex take plain text. One canonical writer for the block; this is wrapping.
 */
export function toHookJson(block: string, event: string): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: block,
    },
  });
}

export const CONTEXT_BEGIN = "<!-- strauss-kb:begin -->";
export const CONTEXT_END = "<!-- strauss-kb:end -->";

export type KbSyncResult = {
  file: string;
  action: "created" | "replaced" | "appended" | "removed" | "unchanged";
};

/**
 * Idempotently plants the block between sentinels in an instruction file
 * (AGENTS.md, CLAUDE.md). This is how a runtime without a reliable
 * post-compact hook keeps a refreshable index: the file is re-read where the
 * conversation is not. Everything outside the sentinels is left alone.
 */
export async function syncInstructions(
  file: string,
  block: string,
): Promise<KbSyncResult> {
  const existing = await readFile(file, "utf8").catch(() => null);
  const region = block
    ? `${CONTEXT_BEGIN}\n${block.trim()}\n${CONTEXT_END}`
    : null;

  if (existing === null) {
    if (!region) return { file, action: "unchanged" };
    await writeFile(file, `${region}\n`, "utf8");
    return { file, action: "created" };
  }

  const begin = existing.indexOf(CONTEXT_BEGIN);
  const end = existing.indexOf(CONTEXT_END);
  if (begin !== -1 && end !== -1 && end >= begin) {
    const before = existing.slice(0, begin);
    const after = existing.slice(end + CONTEXT_END.length);
    const next = region
      ? `${before}${region}${after}`
      : `${before.replace(/\n+$/, "\n")}${after.replace(/^\n+/, "\n")}`;
    if (next === existing) return { file, action: "unchanged" };
    await writeFile(file, next, "utf8");
    return { file, action: region ? "replaced" : "removed" };
  }

  if (!region) return { file, action: "unchanged" };
  await writeFile(
    file,
    `${existing.replace(/\n*$/, "\n\n")}${region}\n`,
    "utf8",
  );
  return { file, action: "appended" };
}
