import { z } from "zod";
import { renderCatalogLine, type KbCatalogResult } from "../catalog.js";
import { KB_RECORD_TYPES } from "../kb-record.schema.js";
import { bundlePath, define } from "./model.js";

export const catalogCommand = define({
  name: "catalog",
  tool: "kb_catalog",
  usage: "catalog [type]",
  description:
    "Every record in the base as one line — concept id, type, title, standing, and a stale flag — sorted by type then title, at roughly thirty tokens each. The tier-one listing: it costs a fraction of kb_load and is what to reach for when kb_load refuses, because a base too large to hold whole is still small enough to name. What that buys is the ability to choose: seeing every id and title, you know which record kb_pack should centre on, and you can conclude that no record covers a question at all — the one conclusion a truncated read can never support. Superseded records are listed with the replacement that stands in their place, so the line to follow instead is already in front of you; bodies are not here, and kb_load, kb_pack or kb_trace fetch them. The decision rule: under kb_load's record gate, load the base whole — perfect recall beats any ranking; past it, kb_catalog then kb_pack; for a lookup by wording, kb_query. Output is deterministic — no timestamp, total ordering — so two catalogs of an unchanged base are byte-identical and diff cleanly.",
  input: z.object({
    bundlePath,
    type: z.enum(KB_RECORD_TYPES).optional(),
  }),
  fromArgv: (argv, path) => ({
    bundlePath: path,
    ...(argv[1] ? { type: argv[1] } : {}),
  }),
  run: async ({ store }, { bundlePath: path, type }) =>
    render(
      await store.catalog(path, { ...(type ? { type } : {}) }),
      path,
      type,
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
): string {
  const counts = [
    `${result.recordCount} ${result.recordCount === 1 ? "record" : "records"}`,
    `${result.currentCount} current`,
    `${result.supersededCount} superseded`,
    `${result.staleCount} stale`,
  ];

  const lines = [
    `# KB Catalog${type ? ` — ${type}` : ""}`,
    `bundle: ${bundle}`,
    counts.join(" · "),
    "",
  ];

  if (!result.entries.length) {
    lines.push(
      type
        ? `(no records of type ${type})`
        : "(no records — this base is empty)",
    );
  } else {
    for (const entry of result.entries) lines.push(renderCatalogLine(entry));
  }

  lines.push(
    "",
    "Bodies are not here: kb_pack <conceptId> for the neighbourhood around one record, kb_load for the whole base when it is under the gate, kb_query for a lookup by wording, kb_trace <conceptId> for how a position was arrived at.",
  );

  return lines.join("\n");
}
