#!/usr/bin/env node
// @ts-check
/**
 * Who reviews this range, and what they read first.
 *
 *   merge-policy.mjs --range <base>..<head> [--repo-root DIR] [--bundle DIR]
 *                    [--policy FILE] [--reviewer FILE|JSON] [--gate FILE|JSON]
 *                    [--approvals FILE|JSON] [--pr N] [--json] [--enforce]
 *                    [--pr-url URL] [--write-record] [--report-out FILE]
 *                    [--summary] [--decider FILE|JSON]
 *                    [--dry-run] [--blind|--visible]
 *                    [--labels FILE|JSON] [--reactions FILE|JSON]
 *                    [--bot-logins a,b]
 *   merge-policy.mjs --calibrate [--since ISO] [--repo SLUG] [--json]
 *
 * The route table, with the rule id each row reports, is the header of
 * [lib/rules.mjs](./lib/rules.mjs). The `decision.merge-<pr>` body always comes
 * back as `record`; `--write-record` is the only thing that lands it, and only
 * for a route no human signs off.
 *
 * Exit codes: without `--enforce`, always 0. With it, the route is the code —
 * see SKILL.md. A dry run always exits 0, so a merge step reads `mode` and
 * never the exit code. Exit 2 is a usage error.
 *
 * `$STRAUSS_MERGE_POLICY_DEFAULTS` names an optional org defaults JSON file,
 * the shallowest policy layer.
 *
 * Node builtins only; the strauss-kb CLI is spawned, never imported.
 */
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { json, launcher } from "../../../hooks/scripts/lib/cli.mjs";
import { git } from "../../../hooks/scripts/lib/git.mjs";
import { childEnv } from "../../../hooks/scripts/lib/util.mjs";
import { gather, makeRun } from "./lib/inputs.mjs";
import { decide } from "./lib/rules.mjs";
import { enforce } from "./lib/enforce.mjs";
import { writeRecord } from "./lib/record.mjs";
import { redact, render, result, verdictOf } from "./lib/render.mjs";
import { placeholder, prRepo, report } from "./lib/report.mjs";
import { blindOf, modeOf } from "./lib/dry-run.mjs";
import {
  calibrate,
  readDryRuns,
  renderCalibration,
  telemetryMode,
  telemetryRoot,
  thresholdsAt,
} from "./lib/calibrate.mjs";

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
                 [--approvals FILE|JSON] [--pr N] [--json] [--enforce]
                 [--pr-url URL] [--write-record] [--report-out FILE] [--summary]
                 [--decider FILE|JSON]
                 [--dry-run] [--blind|--visible] [--labels FILE|JSON]
                 [--reactions FILE|JSON] [--bot-logins a,b]
merge-policy.mjs --calibrate [--since ISO] [--repo SLUG] [--json]`;

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

/** A `--pr-url` becomes an href in the report, so only one shape is taken.
 * @param {string|undefined} value */
export function checkPrUrl(value) {
  if (value === undefined) return null;
  if (!prRepo(value)) {
    throw new UsageError(
      "--pr-url must be https://github.com/<owner>/<repo>/pull/<n>",
    );
  }
  return value;
}

/**
 * The shape each caller payload must have before a rule reads one, so a
 * malformed dump is a usage error rather than a quiet clean answer.
 * @param {unknown} value
 * @param {"--gate"|"--reviewer"|"--approvals"|"--decider"} flag
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
  if (flag === "--decider") {
    if (raw.verdict !== "concur" && raw.verdict !== "escalate")
      bad("needs verdict to be concur or escalate");
    if (raw.reason !== undefined && typeof raw.reason !== "string")
      bad("needs reason to be a string");
    if (raw.verdict === "escalate" && !String(raw.reason ?? "").trim())
      bad("needs a non-empty reason when it escalates");
    for (const key of ["reliedOn", "disputes"]) {
      if (raw[key] === undefined) continue;
      if (
        !Array.isArray(raw[key]) ||
        raw[key].some((/** @type {unknown} */ id) => typeof id !== "string")
      )
        bad(`needs ${key} to be an array of strings`);
    }
  }
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
      decider: { type: "string" },
      pr: { type: "string" },
      json: { type: "boolean", default: false },
      enforce: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
      // The trail an unattended merge leaves behind.
      "pr-url": { type: "string" },
      "write-record": { type: "boolean", default: false },
      "report-out": { type: "string" },
      summary: { type: "boolean", default: false },
      // The dry run, and the calibration loop it feeds.
      "dry-run": { type: "boolean", default: false },
      blind: { type: "boolean", default: false },
      visible: { type: "boolean", default: false },
      labels: { type: "string" },
      reactions: { type: "string" },
      "bot-logins": { type: "string" },
      calibrate: { type: "boolean", default: false },
      since: { type: "string" },
      repo: { type: "string" },
    },
  });
  if (values.help) return { help: true, model: null, exit: 0 };
  if (values.blind === true && values.visible === true) {
    throw new UsageError("--blind and --visible ask for opposite things");
  }
  if (values.calibrate === true) return calibration(values);
  if (!values.range) throw new UsageError("--range <base>..<head> is required");
  // Checked before any work: a summary with nowhere to go is a bad invocation,
  // not a run whose output quietly went nowhere.
  const summaryPath = process.env.GITHUB_STEP_SUMMARY ?? "";
  if (values.summary === true && !summaryPath) {
    throw new UsageError("--summary needs $GITHUB_STEP_SUMMARY to be set");
  }

  const { base, head } = splitRange(values.range);
  const repoRoot = resolve(values["repo-root"] ?? process.cwd());
  const bundle = resolve(values.bundle ?? join(repoRoot, ".strauss", "kb"));
  const bundleDir = relative(repoRoot, bundle).split("\\").join("/");
  const kb = launcher(repoRoot, bundle);
  const pr = checkPr(values.pr);
  const prUrl = checkPrUrl(values["pr-url"]);
  const started = Date.now();
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
      decider: checkPayload(readJson(values.decider, "--decider"), "--decider"),
      gateSupplied: gatePayload !== null,
    },
    makeRun({
      repoRoot,
      bundle,
      git: (args) => git(repoRoot, args),
      kb: (args) => json(kb, args),
      gate,
    }),
    {
      enforcing: values.enforce === true,
      pr,
      prUrl,
      forcedDry: values["dry-run"] === true,
      blind: values.blind === true,
      visible: values.visible === true,
      labels: checkSignals(readJson(values.labels, "--labels"), "--labels"),
      reactions: checkSignals(
        readJson(values.reactions, "--reactions"),
        "--reactions",
      ),
      botLogins: botLogins(values["bot-logins"]),
    },
  );

  if (values["write-record"] === true) {
    model.wrote = writeRecord({
      kb,
      body: model.record,
      route: verdictOf(model),
      enforcing: values.enforce === true,
      enabled: model.policy.enabled,
      mode: model.mode,
    });
  }

  // Blind: the answer is held back until a human has already said theirs, so
  // the block posted before then is a placeholder with the same marker.
  const block = model.signals.withheld ? placeholder(model) : report(model);
  if (values["report-out"]) writeReport(values["report-out"], block);
  if (values.summary === true) {
    appendFileSync(summaryPath, `${block}\n`, "utf8");
  }
  if (values.enforce === true || model.mode === "dry-run") {
    emitRoute(kb, model, Date.now() - started, pr);
  }

  return {
    help: false,
    // Redacted last, and only for the caller: the event above carries the real
    // route, which is what calibration counts.
    model: redact(model),
    // A dry run exits 0 for every route, so a merge step reads `mode` and
    // never this.
    exit: values.enforce === true ? (model.enforce?.exit ?? 0) : 0,
    json: values.json === true,
  };
}

/** `--bot-logins a,b`: logins whose review never lifts the blind and whose
 * reaction is never a disagreement — the reviewer agent, and whoever posts the
 * sticky comment. A `verifiers` entry of kind `agent:` maps to no login, so
 * the caller names them. @param {string|undefined} value */
export function botLogins(value) {
  return (value ?? "")
    .split(",")
    .map((login) => login.trim())
    .filter(Boolean);
}

/**
 * A calibration dump is a list or it is nothing. A malformed one read as empty
 * would say "nobody disagreed", which is the one direction that flatters the
 * route — so it is a usage error instead.
 * @param {unknown} value @param {"--labels"|"--reactions"} flag
 */
export function checkSignals(value, flag) {
  if (value === null) return null;
  if (!Array.isArray(value)) throw new UsageError(`${flag} must be an array`);
  return value;
}

/**
 * `--calibrate`: the false-auto rate over the local stream this step's dry runs
 * wrote. No range, no route and no exit code — a table, and `--json` beside it.
 * @param {Record<string, any>} values
 */
export function calibration(values) {
  if (values.since !== undefined && Number.isNaN(Date.parse(values.since))) {
    throw new UsageError("--since must be a date the stream can be cut at");
  }
  const sink = telemetryMode();
  if (sink === "off") {
    throw new UsageError(
      "STRAUSS_TELEMETRY=off: no dry run was recorded, so there is nothing to calibrate",
    );
  }
  const repoRoot = resolve(values["repo-root"] ?? process.cwd());
  const bundle = resolve(values.bundle ?? join(repoRoot, ".strauss", "kb"));
  const repo = values.repo ?? slugOf(launcher(repoRoot, bundle));
  const thresholds = thresholdsAt(
    (args) =>
      git(repoRoot, ["show", "--no-textconv", "--end-of-options", ...args]),
    "HEAD",
    values.policy ?? null,
  );
  const { events, unreadable } = readDryRuns(
    join(telemetryRoot(), repo),
    values.since,
  );
  const model = {
    repo,
    ...(values.since ? { since: values.since } : {}),
    sink,
    events: events.length,
    unreadable,
    thresholds,
    groups: calibrate(events, thresholds),
  };
  return {
    help: false,
    model,
    exit: /** @type {0} */ (0),
    json: values.json === true,
    text: renderCalibration(model),
  };
}

/**
 * Which directory of the stream is this repository's. `telemetry summary`
 * derives it the one way the package does; a slug guessed here would drift
 * from the one the events were written under.
 * @param {ReturnType<typeof launcher>} kb
 */
function slugOf(kb) {
  const answer = /** @type {any} */ (
    json(kb, ["telemetry", "summary", "--json"])
  );
  const slug = typeof answer?.repo === "string" ? answer.repo : "";
  if (!slug) {
    throw new UsageError(
      "--repo SLUG is required: strauss-kb could not name this repository's telemetry stream",
    );
  }
  return slug;
}

/**
 * Staged then renamed, so a CI step that reads the file concurrently sees the
 * whole block or none of it. An unwritable path is a usage error, not a route.
 * @param {string} path @param {string} block
 */
function writeReport(path, block) {
  const staging = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(staging, block, "utf8");
    renameSync(staging, path);
  } catch (error) {
    rmSync(staging, { force: true });
    throw new UsageError(
      `--report-out could not be written: ${/** @type {Error} */ (error).message}`,
    );
  }
}

/**
 * One event per enforced run and per dry run: facts and counts, never a record
 * body. A dry run reports `would` and an enforced one `route`; everything else
 * is the same, so the calibration read side compares like with like.
 * @param {ReturnType<typeof launcher>} kb @param {any} model @param {number} ms
 * @param {string | null} pr
 */
function emitRoute(kb, model, ms, pr) {
  const dry = model.mode === "dry-run";
  const data = {
    ...(dry ? { would: model.would } : { route: model.route }),
    rule: model.rule,
    policyHash: model.policy.hash,
    classes: classCounts(model.classifier),
    disagreement: model.signals.disagreement,
    blind: model.signals.blind,
    ...(dry ? { withheld: model.signals.withheld } : {}),
    records: model.records.length,
    files: Object.keys(model.classifier).length,
    blocks: model.gate.blocks.length,
    warns: model.gate.warns.length,
    wrote: model.wrote?.written === true,
  };
  json(kb, [
    "telemetry",
    "emit",
    "--component",
    "merge-policy",
    "--event",
    dry ? "dry-run" : "route",
    "--data",
    JSON.stringify(data),
    "--sha",
    model.headSha,
    // Only a numbered PR: the event schema's `pr` is an integer, and a subject
    // like `SAA-745` is a name. Calibration falls back to the sha for those.
    ...(pr && /^[1-9][0-9]*$/.test(pr) ? ["--pr", pr] : []),
    "--duration-ms",
    String(ms),
  ]);
}

/** How many changed files of each class. @param {Record<string, string>} classifier */
function classCounts(classifier) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const name of Object.values(classifier)) {
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

/**
 * The whole step, with every read behind `run`. Unit tests call this.
 * @param {Parameters<typeof gather>[0]} options
 * @param {import("./lib/inputs.mjs").Run} run
 * @param {{ enforcing: boolean, pr: string | null, prUrl?: string | null,
 *   forcedDry?: boolean, blind?: boolean, visible?: boolean, labels?: unknown,
 *   reactions?: unknown, botLogins?: string[] }} how
 */
export function evaluate(options, run, how) {
  const input = gather(options, run);
  const decision = decide(input);
  const verdict = enforce(decision, input);
  const mode = modeOf(input.policy.data.enabled, how.forcedDry === true);
  return result(input, decision, verdict, {
    enforcing: how.enforcing,
    subject: how.pr ?? options.headSha.slice(0, 12),
    pr: how.pr,
    prUrl: how.prUrl ?? null,
    bundleDir: options.bundleDir,
    mode,
    blind: blindOf(mode, {
      blind: how.blind === true,
      visible: how.visible === true,
    }),
    labels: how.labels ?? null,
    reactions: how.reactions ?? null,
    botLogins: how.botLogins ?? [],
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
      // `--calibrate` brings its own table; every other run renders the route.
      process.stdout.write(
        `${/** @type {any} */ (answer).text ?? render(answer.model)}\n`,
      );
    }
    process.exit(answer.exit);
  } catch (error) {
    const failure = /** @type {Error} */ (error);
    process.stderr.write(`merge-policy: ${failure.message}\n`);
    if (failure instanceof UsageError) process.stderr.write(`${USAGE}\n`);
    process.exit(failure instanceof UsageError ? 2 : 1);
  }
}
