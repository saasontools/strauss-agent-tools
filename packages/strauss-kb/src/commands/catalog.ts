import { z } from "zod";
import type { KbStanding } from "../adjudicate.js";
import { renderCatalogLine, type KbCatalogResult } from "../catalog.js";
import { KB_RECORD_TYPES } from "../kb-record.schema.js";
import {
  argvFlags,
  argvPositional,
  bundlePath,
  define,
  TAGS,
} from "./model.js";

export const catalogCommand = define({
  name: "catalog",
  tool: "kb_catalog",
  usage: "catalog [type] [--tag T]...",
  description:
    "Lists every record as one line — concept id, type, title, standing, and a stale flag — at roughly thirty tokens each. Pick this over kb_load once kb_load refuses: kb_catalog never refuses. Superseded records show only their replacement; fetch bodies with kb_load, kb_pack, kb_query, or kb_trace.",
  input: z.object({
    bundlePath,
    type: z.enum(KB_RECORD_TYPES).optional(),
    tags: TAGS,
  }),
  jsonRefused: true,
  fromArgv: (argv, path) => {
    const tags = argvFlags(argv, "--tag");
    // The type is the first positional, in either order: a flag in the slot is
    // a flag, and `catalog --tag review decision` still narrows by type.
    const type = argvPositional(argv, "--tag");
    return {
      bundlePath: path,
      ...(type ? { type } : {}),
      ...(tags.length ? { tags } : {}),
    };
  },
  run: async ({ store }, { bundlePath: path, type, tags }) =>
    render(
      await store.catalog(path, {
        ...(type ? { type } : {}),
        ...(tags ? { tags } : {}),
      }),
      path,
      type,
      tags,
    ),
});

/**
 * Markdown, like `index` and `pack`, because the value is one line per record
 * and JSON would spend a third of the tokens on repeated key names.
 */
function render(
  result: KbCatalogResult,
  bundle: string,
  type?: string,
  tags?: string[],
): string {
  // The filter is named in the heading: an empty catalog otherwise reads as an
  // empty base. Tags carry a prefix so a tag cannot read as a type.
  const narrowed = [
    ...(type ? [type] : []),
    ...(tags?.length ? [`tags: ${tags.join(", ")}`] : []),
  ].join(" · ");
  const lines = [
    `# KB Catalog${narrowed ? ` — ${narrowed}` : ""}`,
    `bundle: ${bundle}`,
    `${count(result.recordCount, "record")}: ${standingCounts(result)}`,
  ];

  // Staleness is a flag over a standing, not a standing — a current record can
  // be stale. Adding it to the run above would make the counts stop summing to
  // the record count, which is the one thing that line is for.
  if (result.staleCount) {
    lines.push(
      `${result.staleCount} stale — a flag over the standings above, not one of them`,
    );
  }

  lines.push("");

  if (!result.entries.length) {
    lines.push(
      narrowed
        ? `(no records matching ${narrowed})`
        : "(no records — this base is empty)",
    );
  } else {
    for (const entry of result.entries) lines.push(renderCatalogLine(entry));
  }

  lines.push(
    "",
    "Bodies are not here: kb_pack <conceptId> for the neighbourhood around one record, kb_load for the whole base when it fits the budget, kb_query for a lookup by wording, kb_trace <conceptId> for how a position was arrived at.",
  );

  return lines.join("\n");
}

/**
 * Every standing that has a record, in order of how live it is. Zero counts are
 * dropped as noise, and what remains sums to the record count — a reader can
 * add the line up and see that nothing went missing.
 */
function standingCounts(result: KbCatalogResult): string {
  const ORDER: readonly KbStanding[] = [
    "current",
    "open",
    "unsettled",
    "rejected",
    "superseded",
  ];
  const parts = ORDER.filter((standing) => result.standings[standing]).map(
    (standing) => `${result.standings[standing]} ${standing}`,
  );
  return parts.length ? parts.join(" · ") : "none";
}

function count(value: number, noun: string): string {
  return `${value} ${value === 1 ? noun : `${noun}s`}`;
}
