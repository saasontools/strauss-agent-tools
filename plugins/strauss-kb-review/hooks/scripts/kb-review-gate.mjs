#!/usr/bin/env node
// @ts-check
/**
 * One script, three callers: the Stop/SubagentStop hook, a consumer's
 * pre-flight (`--report`), and the late fixer.
 *
 *   --session-start   records the session's base commit and seeds the state.
 *   (no flag)         reads a hook payload on stdin; exit 2 blocks the turn.
 *   --report          prints JSON findings and always exits 0.
 *
 * The gate never imports the strauss-kb package: it spawns the installed CLI,
 * so this stays a plain plugin directory with no build. Node builtins only.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as git from "./lib/git.mjs";
import { pastDeadline, setDeadline } from "./lib/cli.mjs";
import { label, render, report, runChecks } from "./lib/report.mjs";
import { buildContext } from "./lib/context.mjs";
import { LOWERING } from "./lib/classify.mjs";
import { declaredPaths, unbackedClasses, undeclarable } from "./lib/declared.mjs";
import { lastAssistantText } from "./lib/reviewer.mjs";
import { bundleStamp, readState, statePath, writeState } from "./lib/state.mjs";
import { gateConfig } from "./lib/thresholds.mjs";

const MAX_BLOCKS = 2;

/** The whole run's budget, under the hook entry's own timeout. Past it the
 * gate stops spawning and passes the turn through. */
const WALL_MS = 45_000;

process.stdout.on("error", () => {});

/** @param {string[]} argv */
export async function main(argv, stdin = () => readFileSync(0, "utf8")) {
  if (argv.includes("--report")) return reportMode(argv);
  /** @type {any} */
  let input;
  try {
    input = JSON.parse(stdin());
  } catch {
    process.stderr.write("strauss-kb gate: unreadable payload; skipped.\n");
    return 0;
  }
  return argv.includes("--session-start") ||
    input?.hook_event_name === "SessionStart"
    ? sessionStart(input)
    : gate(input);
}

/** @param {any} input */
function sessionStart(input) {
  const cwd = cwdOf(input);
  const path = statePath(String(input?.session_id ?? "unknown"));
  writeState(path, {
    base: git.head(cwd),
    digest: null,
    stamp: null,
    blocked: 0,
  });
  return 0;
}

/**
 * Steps 1–7 of the gate, in order. Each early exit is a real one: the loop
 * guard and the idle short-circuit both return before any CLI is spawned.
 * @param {any} input
 */
function gate(input) {
  if (input?.stop_hook_active === true) return 0;
  const sessionId = String(input?.session_id ?? "");
  if (!sessionId) return 0;

  const cwd = cwdOf(input);
  // Installing the plugin must not start blocking turns: arming is a `gate`
  // key in `.strauss/kb-pins.json`, or `STRAUSS_KB_GATE=1`, per workspace.
  if (!gateConfig(cwd) && process.env.STRAUSS_KB_GATE !== "1") return 0;
  const bundle = join(cwd, ".strauss", "kb");
  // No companion base here, so no question this gate could ask of the diff.
  if (!existsSync(bundle)) return 0;
  const path = statePath(sessionId);
  const state = readState(path);
  const range = git.rangeArgs(state.base, null);
  const digest = git.digest(git.diffText(cwd, range));
  const stamp = bundleStamp(bundle);

  if (state.digest === digest && state.stamp === stamp) return 0;
  if (state.digest === digest && state.blocked >= MAX_BLOCKS) {
    warn(
      input,
      `strauss-kb gate: this diff has been blocked ${state.blocked} times — passing it through.`,
    );
    return 0;
  }

  // A subagent in a shared worktree declares what it changed; the gate
  // verifies the declaration against the worktree and scopes itself to it.
  const scope = declaredScope(input, cwd, range);
  if (scope.block) {
    process.stderr.write(`${scope.block}\n`);
    return 2;
  }

  setDeadline(Date.now() + WALL_MS);
  const ctx = buildContext({
    repoRoot: cwd,
    bundle,
    base: state.base,
    paths: scope.paths,
  });
  // A declared class that lowers scrutiny is a claim; the repository backs it
  // with a fact or an attribute, or the turn is asked to write that down.
  const unbacked = unbackedClasses(scope.classes, ctx.classes, LOWERING);
  if (unbacked.length > 0) {
    process.stderr.write(
      `strauss-kb gate: the changed block classes ${unbacked
        .map((item) => `${item.path} as ${item.claimed} (repository says ${item.actual})`)
        .join(", ")}. Declare it in the base — a review:* fact on the hunk or a .gitattributes entry — not only in the block.\n`,
    );
    return 2;
  }
  const findings = runChecks(ctx);
  if (pastDeadline()) {
    warn(
      input,
      `strauss-kb gate: over its ${WALL_MS / 1000}s budget — passing the turn through.`,
    );
    return 0;
  }
  const blocks = findings.filter((item) => item.severity === "block");
  writeState(path, {
    base: state.base,
    digest,
    stamp,
    blocked:
      state.digest === digest && blocks.length > 0
        ? state.blocked + 1
        : blocks.length > 0
          ? 1
          : 0,
  });

  if (blocks.length === 0) {
    if (findings.length > 0) warn(input, render(findings));
    return 0;
  }
  process.stderr.write(`${render(blocks)}\nload review-companion\n`);
  return 2;
}

/**
 * A subagent's `changed` block, checked against the worktree. The parent
 * session declares nothing and owns the whole diff; a subagent with a dirty
 * worktree and no block is asked for one, and a block naming a path the
 * worktree does not show as changed is refused.
 * @param {any} input @param {string} cwd @param {string[]} range
 * @returns {{ paths: string[] | null, classes: Map<string, string>, block: string | null }}
 */
function declaredScope(input, cwd, range) {
  if (input?.hook_event_name !== "SubagentStop") {
    return { paths: null, classes: new Map(), block: null };
  }
  const dirty = new Set([
    ...git.changedFiles(cwd, range).map((file) => file.path),
    ...git.uncommittedPaths(cwd, "."),
  ]);
  const text = lastAssistantText(
    input?.agent_transcript_path ?? input?.transcript_path,
  );
  const declaration = declaredPaths(text);
  if (!declaration) {
    if (dirty.size === 0 || text === null) {
      return { paths: [], classes: new Map(), block: null };
    }
    return {
      paths: null,
      classes: new Map(),
      block:
        'strauss-kb gate: end the turn with a fenced ```changed block whose body is JSON — { "paths": [ { "path": "<repo path>", "class": "<class, optional>" } ] } — listing what you changed, or { "paths": [] } for nothing.',
    };
  }
  const missing = undeclarable(declaration.declared, dirty);
  if (missing.length > 0) {
    return {
      paths: null,
      classes: new Map(),
      block: `strauss-kb gate: the changed block names paths the worktree does not show as changed: ${missing.join(", ")}. Declare only what you changed.`,
    };
  }
  return { paths: declaration.declared, classes: declaration.classes, block: null };
}

/** @param {string[]} argv */
function reportMode(argv) {
  const options = parseArgv(argv);
  if (!existsSync(options.bundle)) {
    process.stderr.write(`strauss-kb gate: no bundle at ${options.bundle}\n`);
  }
  const result = report(options);
  process.stdout.write(
    `${JSON.stringify(
      { ...result, findings: result.findings.map(label) },
      null,
      2,
    )}\n`,
  );
  return 0;
}

/** `--base`, `--head`, `--repo-root`, `--bundle`, `--offline`.
 * @param {string[]} argv */
export function parseArgv(argv) {
  const repoRoot = value(argv, "--repo-root") ?? process.cwd();
  return {
    repoRoot,
    bundle: value(argv, "--bundle") ?? join(repoRoot, ".strauss", "kb"),
    base: value(argv, "--base") ?? git.head(repoRoot),
    head: value(argv, "--head") ?? null,
    offline: argv.includes("--offline"),
    report: true,
  };
}

/** A flag's value, never the next flag: `--base --offline` named no base.
 * @param {string[]} argv @param {string} flag */
function value(argv, flag) {
  const at = argv.indexOf(flag);
  const next = at >= 0 ? (argv[at + 1] ?? null) : null;
  return next && !next.startsWith("--") ? next : null;
}

/** @param {any} input */
function cwdOf(input) {
  return typeof input?.cwd === "string" && input.cwd
    ? input.cwd
    : process.cwd();
}

/** @param {any} input @param {string} text */
function warn(input, text) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: String(input?.hook_event_name ?? "Stop"),
        additionalContext: text,
      },
    }),
  );
}

if (process.argv[1] && process.argv[1].endsWith("kb-review-gate.mjs")) {
  let code;
  try {
    code = await main(process.argv.slice(2));
  } catch {
    code = 0;
  }
  process.exit(code);
}
