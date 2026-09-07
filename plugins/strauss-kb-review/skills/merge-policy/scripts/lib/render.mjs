// @ts-check
/** The two shapes this step prints: the JSON a caller reads, and one table. */
import { oneLine } from "../../../../hooks/scripts/lib/util.mjs";
import { signals } from "./dry-run.mjs";
import { buildRecord } from "./record.mjs";

/** @typedef {import("./inputs.mjs").Input} Input */

/** The route, whichever mode named it. @param {any} model */
export function verdictOf(model) {
  return model.route ?? model.would;
}

/**
 * @param {Input} input
 * @param {{ route: string, rule: string, reason: string }} decision
 * @param {{ exit: 0 | 1, why: string, approvedBy: string[] }} verdict
 * @param {{ enforcing: boolean, subject: string, pr: string | null,
 *   prUrl: string | null, bundleDir: string, mode?: "dry-run" | "enforce",
 *   blind?: boolean, labels?: unknown, reactions?: unknown,
 *   botLogins?: string[] }} options
 */
export function result(input, decision, verdict, options) {
  const mode = options.mode ?? "enforce";
  const dry = mode === "dry-run";
  // `enforce` reads the policy's own `enabled`; a `--dry-run` flag is the other
  // way into the same mode, and a dry run never fails a build.
  const said = dry
    ? {
        ...verdict,
        exit: /** @type {0} */ (0),
        why: "dry run: the route is advice",
      }
    : verdict;
  // Read `pending` first: touching the findings is what spawns the gate.
  const gate = input.gate.pending
    ? { blocks: [], warns: [] }
    : {
        blocks: input.gate.blocks.map((block) => block.id),
        warns: input.gate.warns.map((block) => block.id),
      };
  const notes = notChecked(input);
  return {
    mode,
    // A dry run reports what it *would* have done; `route` is the verdict a
    // run stands behind, so the two names never share a key.
    ...(dry ? { would: decision.route } : { route: decision.route }),
    signals: signals({
      mode,
      blind: options.blind === true,
      headSha: input.headSha,
      approvals: input.approvals,
      labels: options.labels,
      reactions: options.reactions,
      botLogins: options.botLogins,
    }),
    rule: decision.rule,
    reason: decision.reason,
    headSha: input.headSha,
    bundle: options.bundleDir,
    prUrl: options.prUrl,
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
    gate,
    reviewer: {
      present: input.reviewer.present,
      sha: input.reviewer.sha,
      verdicts: input.reviewer.verdicts,
    },
    policy: {
      path: input.policy.path,
      version: input.policy.version,
      hash: input.policy.hash,
      layers: input.policy.layers,
      enabled: input.policy.data.enabled,
    },
    enforce: options.enforcing
      ? { exit: said.exit, why: said.why, approvedBy: said.approvedBy }
      : null,
    notChecked: notes,
    record: buildRecord(input, decision, said, {
      subject: options.subject,
      pr: options.pr,
      prUrl: options.prUrl,
      notChecked: notes,
      enforcing: options.enforcing,
      gate,
    }),
    // `--write-record` fills this in; a run that did not ask leaves it null.
    wrote:
      /** @type {ReturnType<typeof import("./record.mjs").writeRecord> | null} */ (
        null
      ),
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
 * The model a withheld run may show: the verdict is replaced rather than
 * printed, so the blind holds for a log and an artifact as well as the block.
 * @param {any} model
 */
export function redact(model) {
  if (model?.signals?.withheld !== true) return model;
  return { ...model, would: "<withheld>", withheld: true };
}

/** One line, then the records the route turned on. @param {any} model */
export function render(model) {
  const dry = model.mode === "dry-run";
  const signal = model.signals;
  const lines = signal?.withheld
    ? [
        "dry run: would <withheld>",
        `  withheld until the first human review on ${model.headSha}`,
      ]
    : [
        dry
          ? `dry run: would ${model.would} (${model.rule})`
          : `route: ${model.route} (${model.rule})`,
        `  ${model.reason}`,
      ];
  if (signal?.disagreement) {
    lines.push(`  a human disagreed: ${signal.signals.join(", ")}`);
  }
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
  if (model.wrote)
    lines.push(
      model.wrote.written
        ? `  wrote ${model.wrote.conceptId}`
        : `  wrote nothing — ${model.wrote.why}`,
    );
  return lines.join("\n");
}

/** @param {string} text @param {number} width */
function pad(text, width) {
  const flat = oneLine(text, width);
  return flat.padEnd(width);
}
