// @ts-check
/**
 * `REPORT.md` — what a human reads before approving the merge, and what the
 * pull request body is built from.
 */
import { oneLine } from "../util.mjs";

/**
 * @typedef {import("../base.mjs").BaseRecord} BaseRecord
 * @typedef {import("./trailers.mjs").Trailers} Trailers
 * @typedef {{ to: string, hop: string, range: string[],
 *   taken: import("./select.mjs").Taken[],
 *   left: import("./select.mjs").Left[],
 *   promoted: string[], skipped: { conceptId: string, settledBy: string }[],
 *   trailers: Trailers, reasons: Map<string, string>,
 *   dryRun: boolean }} ReportInput
 */

/** An item still owed an answer. */
const OPEN = {
  risk: (/** @type {string} */ status) => status !== "resolved",
  "open-question": (/** @type {string} */ status) => status !== "resolved",
  "test-obligation": (/** @type {string} */ status) => status === "open",
};

/** @param {ReportInput} input @returns {string} */
export function renderReport(input) {
  const records = input.taken.map((row) => row.record);
  const lines = [
    "# Review report",
    "",
    `Hop: \`${input.hop}\` into \`${input.to}\`${input.dryRun ? " (dry run)" : ""}.`,
    `Range: \`${input.range.join(" ") || "none"}\`.`,
    `${input.promoted.length} promoted, ${input.skipped.length} left to a human, ${input.left.length} not selected.`,
    "",
    ...openItems(records),
    ...riskRows(records, input),
    ...decisionRows(records),
    ...notSelected(input.left),
  ];
  return `${lines.join("\n").trimEnd()}\n`;
}

/** @param {BaseRecord[]} records */
function openItems(records) {
  const open = records.filter((record) => {
    const test = /** @type {any} */ (OPEN)[record.type];
    return typeof test === "function" && test(record.status);
  });
  if (!open.length) return ["## Open items", "", "None.", ""];
  return [
    "## Open items",
    "",
    ...open.map(
      (record) =>
        `- \`${record.conceptId}\` — ${title(record)} (${oneLine(
          record.status,
          40,
        )}${record.materiality ? `, ${oneLine(record.materiality, 40)}` : ""})`,
    ),
    "",
  ];
}

/** @param {BaseRecord[]} records @param {ReportInput} input */
function riskRows(records, input) {
  const risks = records.filter((record) => record.type === "risk");
  if (!risks.length) return ["## Risks", "", "None.", ""];
  const rows = risks.map((record) => {
    const id = record.conceptId;
    return `| \`${id}\` | ${cell([record.status])} | ${cell(
      record.materiality ? [record.materiality] : [],
    )} | ${cell(input.trailers.addressedBy.get(id))} | ${cell(
      input.trailers.pinnedBy.get(id),
    )} | ${cell(verdicts(record))} | ${cell(reason(input, id))} |`;
  });
  return [
    "## Risks",
    "",
    "| Risk | State | Materiality | Fix | Test | Verdict | Closed because |",
    "| ---- | ----- | ----------- | --- | ---- | ------- | -------------- |",
    ...rows,
    "",
  ];
}

/** @param {BaseRecord[]} records */
function decisionRows(records) {
  const decisions = records.filter((record) => record.type === "decision");
  if (!decisions.length) return ["## Decisions", "", "None.", ""];
  return [
    "## Decisions",
    "",
    ...decisions.map(
      (record) =>
        `- \`${record.conceptId}\` — ${title(record)}\n  ${anchors(record)}`,
    ),
    "",
  ];
}

/** @param {import("./select.mjs").Left[]} left */
function notSelected(left) {
  if (!left.length) return [];
  /** @type {Map<string, string[]>} */
  const byReason = new Map();
  for (const row of left) {
    const held = byReason.get(row.why) ?? [];
    held.push(row.record.conceptId);
    byReason.set(row.why, held);
  }
  return [
    "## Not selected",
    "",
    ...[...byReason].map(
      ([why, ids]) => `- ${why} — ${ids.length}: ${ids.join(", ")}`,
    ),
    "",
  ];
}

/** The reviewers' verdicts on a record, newest last. @param {BaseRecord} record */
function verdicts(record) {
  return record.verified.map((event) => {
    const value = /** @type {any} */ (event);
    return `${oneLine(value?.by, 40)}: ${oneLine(value?.note, 80)}`;
  });
}

/** @param {BaseRecord} record */
function anchors(record) {
  if (!record.anchors.length) return "_no anchors_";
  return record.anchors
    .map(
      (anchor) =>
        `\`${oneLine(anchor.file, 120)}${
          anchor.symbol ? `:${oneLine(anchor.symbol, 80)}` : ""
        }\``,
    )
    .join(", ");
}

/** @param {BaseRecord} record */
function title(record) {
  return oneLine(record.title || record.conceptId, 120);
}

/**
 * One table cell. Every value is free text a reviewer or a commit wrote, so it
 * is folded to one line and its `|` escaped: an unescaped one forges a row.
 * @param {string[] | undefined} values
 */
function cell(values) {
  if (!values || !values.length) return "—";
  return (
    values
      .map((value) => oneLine(value, 80).replace(/\|/g, "\\|"))
      .join("<br>")
      .trim() || "—"
  );
}

/** @param {ReportInput} input @param {string} id @returns {string[]} */
function reason(input, id) {
  const text = input.reasons.get(id);
  return text ? [text] : [];
}
