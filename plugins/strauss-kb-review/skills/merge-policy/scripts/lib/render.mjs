// @ts-check
/** The two shapes this step prints: the JSON a caller reads, and one table. */
import { oneLine } from "../../../../hooks/scripts/lib/util.mjs";
import { reviewed } from "./rules.mjs";

/** @typedef {import("./inputs.mjs").Input} Input */

/**
 * @param {Input} input
 * @param {{ route: string, rule: string, reason: string }} decision
 * @param {{ exit: 0 | 1, why: string, approvedBy: string[] }} verdict
 * @param {{ enforcing: boolean, subject: string }} options
 */
export function result(input, decision, verdict, options) {
  return {
    route: decision.route,
    rule: decision.rule,
    reason: decision.reason,
    records: input.records
      .filter((record) => record.onDiff)
      .map((record) => ({
        id: record.id,
        type: record.type,
        materiality: record.materiality,
        effective: record.effective,
        status: record.status,
        verifiedBy: record.verifiedBy,
      })),
    classifier: Object.fromEntries(
      input.files.map((file) => [file.path, file.class]),
    ),
    // Read `pending` first: touching the findings is what spawns the gate.
    gate: input.gate.pending
      ? { blocks: [], warns: [] }
      : {
          blocks: input.gate.blocks.map((block) => block.id),
          warns: input.gate.warns.map((block) => block.id),
        },
    reviewer: {
      present: input.reviewer.present,
      sha: input.reviewer.sha,
      verdicts: input.reviewer.verdicts,
    },
    policy: {
      path: input.policy.path,
      version: input.policy.version,
      hash: input.policy.hash,
    },
    enforce: options.enforcing
      ? { exit: verdict.exit, why: verdict.why, approvedBy: verdict.approvedBy }
      : null,
    notChecked: notChecked(input),
    record: record(input, decision, options.subject),
  };
}

/** What this run did not look at, so a reader is never told it was covered.
 * @param {Input} input */
function notChecked(input) {
  const excluded = input.files
    .filter((file) => file.excluded && !file.crosses)
    .map((file) => file.path);
  return [
    ...input.policy.notChecked,
    ...(excluded.length > 0
      ? [`paths excluded by policy: ${excluded.join(", ")}`]
      : []),
    ...(input.unreadable.length > 0
      ? [`records unreadable: ${input.unreadable.join(", ")}`]
      : []),
    ...gateNotes(input.gate),
    ...(input.reviewer.present ? [] : ["reviewer: no --reviewer output"]),
    ...(input.approvals.length > 0 ? [] : ["approvals: no --approvals dump"]),
  ];
}

/** @param {Input["gate"]} gate */
function gateNotes(gate) {
  const notes = gate.supplied ? ["gate: supplied by --gate, not run"] : [];
  if (gate.pending) notes.push("gate: a row above it decided this range");
  else if (gate.answered === false) notes.push("gate: did not answer");
  return notes;
}

/**
 * The `decision.merge-<subject>` body. This step never writes it — SAA-744
 * owns the write, so the route stays a read of the base.
 * @param {Input} input
 * @param {{ route: string, rule: string, reason: string }} decision
 * @param {string} subject
 */
function record(input, decision, subject) {
  return {
    conceptId: `decision.merge-${subject}`,
    type: "decision",
    title: `Merge route for ${subject} is ${decision.route}`,
    description: oneLine(decision.reason, 240),
    decision: `${decision.route} — matched ${decision.rule}.`,
    alternative:
      "Route by hand. Rejected: the rules are deterministic over the base, so a hand route is unreproducible.",
    impact:
      `Head ${input.headSha}, policy ${input.policy.path ?? "absent"} ${input.policy.hash ?? ""}.`.trim(),
    tags: ["review", "review:merge-policy"],
    anchors: reviewed(input).map((file) => ({ file: file.path })),
  };
}

/** One line, then the records the route turned on. @param {any} model */
export function render(model) {
  const lines = [`route: ${model.route} (${model.rule})`, `  ${model.reason}`];
  if (model.records.length > 0) {
    lines.push(
      "",
      `  ${"record".padEnd(34)}  ${"type".padEnd(15)}  ${"materiality".padEnd(12)}  status`,
    );
    for (const item of model.records) {
      lines.push(
        `  ${pad(item.id, 34)}  ${pad(item.type, 15)}  ${pad(item.effective, 12)}  ${item.status}`,
      );
    }
  }
  if (model.gate.blocks.length > 0) {
    lines.push("", `  gate blocks: ${model.gate.blocks.join(", ")}`);
  }
  for (const item of model.notChecked) lines.push(`  not checked — ${item}`);
  if (model.enforce)
    lines.push(
      "",
      `  enforce: exit ${model.enforce.exit} — ${model.enforce.why}`,
    );
  return lines.join("\n");
}

/** @param {string} text @param {number} width */
function pad(text, width) {
  const flat = oneLine(text, width);
  return flat.padEnd(width);
}
