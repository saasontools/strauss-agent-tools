#!/usr/bin/env node
// @ts-check
/**
 * Who reviews this range, and what they read first.
 *
 *   merge-policy.mjs --range <base>..<head> [--repo-root DIR] [--bundle DIR]
 *                    [--policy FILE] [--reviewer FILE|JSON] [--gate FILE|JSON]
 *                    [--approvals FILE|JSON] [--pr N] [--json] [--enforce]
 *
 * The route table, with the rule id each row reports, is the header of
 * [lib/rules.mjs](./lib/rules.mjs). Nothing is written: the
 * `decision.merge-<pr>` body comes back as `record` for SAA-744 to write.
 *
 * Exit codes: without `--enforce`, always 0. With it, the route is the code —
 * see SKILL.md. Exit 2 is a usage error.
 *
 * `$STRAUSS_MERGE_POLICY_DEFAULTS` names an optional org defaults JSON file,
 * the shallowest policy layer.
 *
 * Node builtins only; the strauss-kb CLI is spawned, never imported.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { json, launcher } from "../../../hooks/scripts/lib/cli.mjs";
import { git } from "../../../hooks/scripts/lib/git.mjs";
import { childEnv } from "../../../hooks/scripts/lib/util.mjs";
import { gather, makeRun } from "./lib/inputs.mjs";
import { decide } from "./lib/rules.mjs";
import { enforce } from "./lib/enforce.mjs";
import { render, result } from "./lib/render.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = join(
  HERE,
  "..",
  "..",
  "..",
  "hooks",
  "scripts",
  "kb-review-gate.mjs",
);

/** The gate runs every check family, so it gets more room than a kb verb. */
const GATE_TIMEOUT_MS = 120_000;

const USAGE = `merge-policy.mjs --range <base>..<head> [--repo-root DIR] [--bundle DIR]
                 [--policy FILE] [--reviewer FILE|JSON] [--gate FILE|JSON]
                 [--approvals FILE|JSON] [--pr N] [--json] [--enforce]`;

/** A bad invocation, which exits 2 rather than looking like a base problem. */
export class UsageError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

/** A path to JSON, or the JSON itself. @param {string|undefined} value @param {string} flag */
export function readJson(value, flag) {
  if (!value) return null;
  const head = value.trimStart()[0];
  let text = value;
  if (head !== "{" && head !== "[") {
    try {
      text = readFileSync(value, "utf8");
    } catch (error) {
      // A typo'd path is a usage error, not "human, no approval".
      throw new UsageError(
        `${flag} is not readable: ${/** @type {Error} */ (error).message}`,
      );
    }
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new UsageError(
      `${flag} is not JSON: ${/** @type {Error} */ (error).message}`,
    );
  }
}

/**
 * The org defaults layer, named by env because it is the same file for every
 * repository a runner checks out. Named and unreadable comes back as text
 * `null`, which the policy reports as an error rather than as absence.
 * @param {Record<string, string | undefined>} env
 * @returns {{ path: string, text: string | null } | null}
 */
export function orgDefaults(env) {
  const path = env.STRAUSS_MERGE_POLICY_DEFAULTS;
  if (!path) return null;
  try {
    return { path, text: readFileSync(path, "utf8") };
  } catch {
    return { path, text: null };
  }
}

/** A `--pr` becomes a concept id, so it is a name and nothing else. */
const PR = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** @param {string|undefined} value */
export function checkPr(value) {
  if (value === undefined) return null;
  if (!PR.test(value)) {
    throw new UsageError(`--pr must match ${PR.source}`);
  }
  return value;
}

/**
 * The shape each caller payload must have before a rule reads one, so a
 * malformed dump is a usage error rather than a quiet clean answer.
 * @param {unknown} value @param {"--gate"|"--reviewer"|"--approvals"} flag
 */
export function checkPayload(value, flag) {
  if (value === null) return flag === "--approvals" ? [] : null;
  const bad = (/** @type {string} */ why) => {
    throw new UsageError(`${flag} ${why}`);
  };
  if (flag === "--approvals") {
    if (!Array.isArray(value)) bad("must be an array of reviews");
    for (const row of /** @type {any[]} */ (value)) {
      if (!row || typeof row !== "object" || Array.isArray(row))
        bad("must hold review objects");
      if (typeof row.state !== "string") bad("needs a state on every review");
    }
    return value;
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    bad("must be a JSON object");
  const raw = /** @type {any} */ (value);
  if (flag === "--gate" && !Array.isArray(raw.findings))
    bad("needs a findings array");
  if (
    flag === "--reviewer" &&
    raw.written !== undefined &&
    !Array.isArray(raw.written)
  )
    bad("needs written to be an array");
  return value;
}

/** @param {string} range */
export function splitRange(range) {
  const at = range.indexOf("..");
  const base = at < 0 ? "" : range.slice(0, at);
  const rest = at < 0 ? "" : range.slice(at + 2);
  const head = rest.startsWith(".") ? rest.slice(1) : rest;
  if (!base || !head) {
    throw new UsageError("--range must be <base>..<head>, both halves named");
  }
  return { base, head };
}

/** @param {string[]} argv */
export function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      range: { type: "string" },
      "repo-root": { type: "string" },
      bundle: { type: "string" },
      policy: { type: "string" },
      reviewer: { type: "string" },
      gate: { type: "string" },
      approvals: { type: "string" },
      pr: { type: "string" },
      json: { type: "boolean", default: false },
      enforce: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) return { help: true, model: null, exit: 0 };
  if (!values.range) throw new UsageError("--range <base>..<head> is required");

  const { base, head } = splitRange(values.range);
  const repoRoot = resolve(values["repo-root"] ?? process.cwd());
  const bundle = resolve(values.bundle ?? join(repoRoot, ".strauss", "kb"));
  const bundleDir = relative(repoRoot, bundle).split("\\").join("/");
  const kb = launcher(repoRoot, bundle);
  const pr = checkPr(values.pr);
  const gatePayload = checkPayload(readJson(values.gate, "--gate"), "--gate");
  const gate = memo(
    () => gatePayload ?? runGate({ repoRoot, bundle, base, head }),
  );

  const model = evaluate(
    {
      base,
      head,
      headSha: revParse(repoRoot, head) ?? head,
      repoRoot,
      bundleDir,
      policyPath: values.policy ?? null,
      defaults: orgDefaults(process.env),
      reviewer: checkPayload(
        readJson(values.reviewer, "--reviewer"),
        "--reviewer",
      ),
      approvals: /** @type {any[]} */ (
        checkPayload(readJson(values.approvals, "--approvals"), "--approvals")
      ),
      gateSupplied: gatePayload !== null,
    },
    makeRun({
      repoRoot,
      bundle,
      git: (args) => git(repoRoot, args),
      kb: (args) => json(kb, args),
      gate,
    }),
    { enforcing: values.enforce === true, pr },
  );

  return {
    help: false,
    model,
    exit: values.enforce === true ? (model.enforce?.exit ?? 0) : 0,
    json: values.json === true,
  };
}

/**
 * The whole step, with every read behind `run`. Unit tests call this.
 * @param {Parameters<typeof gather>[0]} options
 * @param {import("./lib/inputs.mjs").Run} run
 * @param {{ enforcing: boolean, pr: string | null }} how
 */
export function evaluate(options, run, how) {
  const input = gather(options, run);
  const decision = decide(input);
  const verdict = enforce(decision, input);
  return result(input, decision, verdict, {
    enforcing: how.enforcing,
    subject: how.pr ?? options.headSha.slice(0, 12),
  });
}

/** Computed at most once, and only if something asks.
 * @template T @param {() => T} compute @returns {() => T} */
function memo(compute) {
  /** @type {{ value: T } | null} */
  let held = null;
  return () => (held ??= { value: compute() }).value;
}

/** `--verify` is what keeps rev-parse from echoing its own flags back.
 * @param {string} repoRoot @param {string} rev */
function revParse(repoRoot, rev) {
  const out = git(repoRoot, ["rev-parse", "--verify", "--end-of-options", rev]);
  return (out ?? "").trim() || null;
}

/**
 * The gate's own `--report`, when the caller did not pass one, or null when it
 * did not answer. Never through a shell: the range and the bundle path are
 * caller strings. Its budget is longer than a kb verb's — it runs every check.
 * @param {{ repoRoot: string, bundle: string, base: string, head: string }} where
 */
function runGate(where) {
  const answer = spawnSync(
    process.execPath,
    [
      GATE,
      "--report",
      "--repo-root",
      where.repoRoot,
      "--bundle",
      where.bundle,
      "--base",
      where.base,
      "--head",
      where.head,
      "--offline",
    ],
    {
      cwd: where.repoRoot,
      encoding: "utf8",
      timeout: GATE_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      env: childEnv(),
      shell: false,
    },
  );
  if (answer.error || answer.status !== 0) return null;
  try {
    return JSON.parse(answer.stdout ?? "");
  } catch {
    // Null, not `{ findings: [] }`: a gate that crashed or timed out checked
    // nothing, which `gate-unavailable` routes human.
    return null;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const answer = main(process.argv.slice(2));
    if (answer.help) {
      process.stdout.write(`${USAGE}\n`);
    } else if (answer.json) {
      process.stdout.write(`${JSON.stringify(answer.model, null, 2)}\n`);
    } else {
      process.stdout.write(`${render(answer.model)}\n`);
    }
    process.exit(answer.exit);
  } catch (error) {
    const failure = /** @type {Error} */ (error);
    process.stderr.write(`merge-policy: ${failure.message}\n`);
    if (failure instanceof UsageError) process.stderr.write(`${USAGE}\n`);
    process.exit(failure instanceof UsageError ? 2 : 1);
  }
}
