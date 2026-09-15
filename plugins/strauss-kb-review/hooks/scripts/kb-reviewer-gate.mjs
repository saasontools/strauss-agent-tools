#!/usr/bin/env node
// @ts-check
/**
 * The reviewer gate: mechanics the kb-review skill states, enforced on the
 * reviewers the repository's roster names. One script, two events, told
 * apart by `hook_event_name`:
 *
 *   PreToolUse   a base write from a roster reviewer carries its own actor,
 *                follows a load of the base, is a reviewer's kind of write,
 *                and lands on a validated base.
 *   Stop         a roster reviewer loaded the base and ends its turn with
 *                its `kb` report block.
 *
 * Payloads not from a roster reviewer pass untouched. Ships unwired; the
 * plugin README says where each client takes the entry. Node builtins only.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { launcher, run, setDeadline } from "./lib/cli.mjs";
import {
  denyReason,
  hasReportBlock,
  isLoad,
  lastAssistantText,
  recordAuthor,
  reviewerOf,
  rosterOf,
} from "./lib/reviewer.mjs";
import { bundleStamp, readState, statePath, writeState } from "./lib/state.mjs";

/** Validate plus doctor, under the hook entry's own timeout. */
const WALL_MS = 25_000;

process.stdout.on("error", () => {});

/** @param {string[]} argv */
export async function main(argv, stdin = () => readFileSync(0, "utf8")) {
  /** @type {any} */
  let input;
  try {
    input = JSON.parse(stdin());
  } catch {
    process.stderr.write(
      "strauss-kb reviewer gate: unreadable payload; skipped.\n",
    );
    return 0;
  }
  const cwd =
    typeof input?.cwd === "string" && input.cwd ? input.cwd : process.cwd();
  const reviewer = reviewerOf(input, rosterOf(cwd));
  if (!reviewer) return 0;
  const event = String(input?.hook_event_name ?? "");
  const path = statePath(
    `${String(input?.session_id ?? "unknown")}.reviewer.${reviewer.name}`,
  );
  if (event === "PreToolUse") return preToolUse(input, cwd, reviewer, path);
  if (event === "Stop" || event === "SubagentStop") {
    return stop(input, cwd, reviewer, path);
  }
  void argv;
  return 0;
}

/**
 * @param {any} input @param {string} cwd
 * @param {import("./lib/reviewer.mjs").Reviewer} reviewer
 * @param {string} path this reviewer's state file
 */
function preToolUse(input, cwd, reviewer, path) {
  const bundle = join(cwd, ".strauss", "kb");
  const toolName = String(input?.tool_name ?? "");
  const command =
    typeof input?.tool_input?.command === "string"
      ? input.tool_input.command
      : null;
  const state = readState(path);
  if (isLoad(toolName, command)) {
    if (!state.loaded) writeState(path, { ...state, loaded: true });
    return 0;
  }
  const reason = denyReason({
    reviewer,
    toolName,
    command,
    loaded: state.loaded === true || !existsSync(bundle),
    authorOf: (id) => recordAuthor(bundle, id),
    preflight: () => preflight(path, cwd, bundle),
  });
  if (!reason) return 0;
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })}\n`,
  );
  return 0;
}

/**
 * `validate` and `doctor --strict` once per base state, remembered per
 * reviewer and session. Returns the failing report, or null when the base is
 * sound or the CLI is not installed (the write itself will say so).
 * @param {string} path @param {string} cwd @param {string} bundle
 */
function preflight(path, cwd, bundle) {
  if (!existsSync(bundle)) return null;
  const state = readState(path);
  const stamp = bundleStamp(bundle);
  if (stamp && state.stamp === stamp) return state.base || null;
  setDeadline(Date.now() + WALL_MS);
  const kb = launcher(cwd, bundle);
  const report = [];
  for (const args of [
    ["validate"],
    ["doctor", "--strict", "--repo-root", cwd],
  ]) {
    const result = run(kb, args);
    if (result.missing || result.unknownVerb) return null;
    if (result.status !== 0) {
      report.push(
        `${args.join(" ")}: exit ${result.status}\n${(result.stderr || result.stdout).trim()}`,
      );
    }
  }
  const failed = report.length > 0 ? report.join("\n") : null;
  // `base` carries the report: the state file's shape is the author gate's,
  // and only `stamp`, `loaded` and one string are needed here.
  writeState(path, { ...state, base: failed, digest: null, stamp, blocked: 0 });
  return failed;
}

/**
 * @param {any} input @param {string} cwd
 * @param {import("./lib/reviewer.mjs").Reviewer} reviewer
 * @param {string} path this reviewer's state file
 */
function stop(input, cwd, reviewer, path) {
  if (input?.stop_hook_active === true) return 0;
  if (
    existsSync(join(cwd, ".strauss", "kb")) &&
    readState(path).loaded !== true
  ) {
    return block(
      "Load the base before ending the review: kb_load, or strauss-kb load. Then end with the kb report block from the kb-review skill.",
    );
  }
  const text = lastAssistantText(input?.transcript_path);
  if (text === null) {
    process.stderr.write(
      "strauss-kb reviewer gate: no transcript to read; report block unchecked.\n",
    );
    return 0;
  }
  if (hasReportBlock(text)) return 0;
  return block(
    `End the review with the kb report block from the kb-review skill: a fenced \`\`\`kb block with actor ${reviewer.actor}, a verdict per record, and what you wrote.`,
  );
}

/** @param {string} reason */
function block(reason) {
  process.stdout.write(`${JSON.stringify({ decision: "block", reason })}\n`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("kb-reviewer-gate.mjs")) {
  let code;
  try {
    code = await main(process.argv.slice(2));
  } catch {
    code = 0;
  }
  process.exit(code);
}
