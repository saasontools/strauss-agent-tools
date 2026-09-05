// @ts-check
/**
 * The calibration loop's read side: the false-auto rate per class and per rule,
 * over the local telemetry stream this step's dry runs wrote.
 *
 * It reads the events file directly. `telemetry summary` aggregates its own
 * metrics and returns no raw events, so it is asked only for the repository
 * slug — the one rule for naming a stream's directory stays in the package.
 */
import { closeSync, openSync, readdirSync, readSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { asString } from "../../../../hooks/scripts/lib/util.mjs";
import { CALIBRATION_DEFAULTS, POLICY_PATHS, readPolicy } from "./policy.mjs";
import { UNATTENDED } from "./record.mjs";

/** As many of a slug's files as the package's read side opens, newest last. */
const MAX_FILES = 10;

/** Enough of a file to hold a line, never the whole of a rotated 10 MiB one. */
const CHUNK = 64 * 1024;

/** Where the package's local sink writes, mirrored here because no verb says. */
export function telemetryRoot() {
  return (
    process.env.STRAUSS_TELEMETRY_DIR ??
    join(homedir(), ".strauss", "telemetry")
  );
}

/** Which sink the events went to. `--calibrate` reads what `local` wrote, so
 * any other mode has a different story to tell about an empty table.
 * @returns {"local" | "stdout" | "off"} */
export function telemetryMode() {
  const value = (process.env.STRAUSS_TELEMETRY ?? "").toLowerCase();
  return value === "off" || value === "stdout" ? value : "local";
}

/**
 * The newest `MAX_FILES` of one slug's `events*.jsonl`, oldest first, as this
 * step's own dry-run events. Read a line at a time so a rotated file is never
 * held whole. A line that will not parse is counted, never dropped silently.
 * @param {string} dir @param {string} [since] an ISO instant to cut at
 * @returns {{ events: any[], unreadable: number }}
 */
export function readDryRuns(dir, since) {
  /** @type {string[]} */
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    // No directory is no dry runs yet, which is a table with no rows.
    return { events: [], unreadable: 0 };
  }
  const floor = since ? Date.parse(since) : Number.NEGATIVE_INFINITY;
  /** @type {{ at: number, event: any }[]} */
  const rows = [];
  let unreadable = 0;
  for (const name of newestFiles(names)) {
    for (const line of lines(join(dir, name))) {
      if (!line.trim()) continue;
      /** @type {any} */
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        unreadable += 1;
        continue;
      }
      if (event?.component !== "merge-policy") continue;
      if (event?.event !== "dry-run") continue;
      if (Date.parse(asString(event.ts)) < floor) continue;
      rows.push({ at: rows.length, event });
    }
  }
  // File then line order breaks a tie, so two events on one instant come back
  // in the same order on every read.
  rows.sort(
    (left, right) =>
      compare(asString(left.event.ts), asString(right.event.ts)) ||
      left.at - right.at,
  );
  return { events: rows.map((row) => row.event), unreadable };
}

/** One file's lines, a chunk at a time. The package streams with
 * `createInterface`; this step is synchronous, so it reads the same way by
 * hand. @param {string} path @returns {Generator<string>} */
function* lines(path) {
  /** @type {number} */
  let fd;
  try {
    fd = openSync(path, "r");
  } catch {
    return;
  }
  const buffer = Buffer.alloc(CHUNK);
  const decoder = new StringDecoder("utf8");
  let held = "";
  try {
    for (;;) {
      const read = readSync(fd, buffer, 0, CHUNK, null);
      if (read === 0) break;
      held += decoder.write(buffer.subarray(0, read));
      const parts = held.split("\n");
      held = parts.pop() ?? "";
      yield* parts;
    }
  } finally {
    closeSync(fd);
  }
  held += decoder.end();
  if (held) yield held;
}

/** @param {string} left @param {string} right */
function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Rotated files are numbered oldest first, with the live file newest; the
 * tail is as far back as the read goes. @param {string[]} names */
function newestFiles(names) {
  const rotated = names
    .map((name) => /^events\.(\d+)\.jsonl$/.exec(name))
    .flatMap((hit) => (hit ? [{ name: hit[0], n: Number(hit[1]) }] : []))
    .sort((left, right) => left.n - right.n)
    .map((entry) => entry.name);
  const ordered = names.includes("events.jsonl")
    ? [...rotated, "events.jsonl"]
    : rotated;
  return ordered.slice(-MAX_FILES);
}

/**
 * The `calibration` block of the policy at `rev`, or the built-in defaults for
 * a policy that is absent or would not parse. Read from the working branch and
 * not from a base: this report gates nothing, so a branch's own numbers can
 * only ever change what a table prints.
 * @param {(args: string[]) => string | null} show `git show <rev>:<path>`
 * @param {string} rev @param {string | null} policyPath
 */
export function thresholdsAt(show, rev, policyPath) {
  const policy = readPolicy(
    show,
    rev,
    policyPath ? [policyPath] : POLICY_PATHS,
  );
  return policy.errors.length > 0
    ? { ...CALIBRATION_DEFAULTS }
    : policy.data.calibration;
}

/**
 * One observation per pull request, the newest event winning: a PR is re-run on
 * every push, and counting each push would weight a busy branch as many PRs. A
 * run with no `--pr` judged no PR, so it is never a denominator.
 * @param {any[]} events
 */
export function latestPerPr(events) {
  /** @type {Map<string, any>} */
  const held = new Map();
  for (const event of events) {
    const pr = event.pr;
    if (pr === undefined || pr === null) continue;
    const key = `${asString(event.data?.policyHash)}|pr:${String(pr)}`;
    const prior = held.get(key);
    if (!prior || compare(asString(prior.ts), asString(event.ts)) <= 0) {
      held.set(key, event);
    }
  }
  return [...held.values()];
}

/**
 * The false-auto rate: of the PRs this policy would have merged unattended,
 * how many a human said it should not have. Grouped by `policy.hash` first, so
 * a policy change starts the count over rather than carrying its own history.
 * @param {any[]} events
 * @param {{ window: number, maxFalseAuto: number }} thresholds
 */
export function calibrate(events, thresholds) {
  /** @type {Map<string, any>} */
  const groups = new Map();
  for (const event of latestPerPr(events)) {
    const data = event.data ?? {};
    const would = asString(data.would);
    if (!UNATTENDED.includes(would)) continue;
    const hash = asString(data.policyHash) || "no hash";
    const group = take(groups, hash, () => ({ policyHash: hash, routes: {} }));
    const route = take(group.routes, would, () => ({
      would,
      prs: 0,
      disagreed: 0,
      byClass: {},
      byRule: {},
    }));
    const bad = data.disagreement === true;
    route.prs += 1;
    route.disagreed += bad ? 1 : 0;
    bump(route.byRule, asString(data.rule) || "no rule", bad);
    for (const name of Object.keys(classesOf(data.classes))) {
      bump(route.byClass, name, bad);
    }
  }
  return [...groups.values()]
    .map((group) => ({
      policyHash: group.policyHash,
      routes: Object.values(group.routes)
        .map((/** @type {any} */ route) => ({
          would: route.would,
          n: route.prs,
          disagreed: route.disagreed,
          rate: rate(route.disagreed, route.prs),
          byClass: rates(route.byClass, thresholds),
          byRule: rates(route.byRule, thresholds),
        }))
        .sort((left, right) => left.would.localeCompare(right.would)),
    }))
    .sort((left, right) => left.policyHash.localeCompare(right.policyHash));
}

/** `{ docs: 3 }` and nothing else: a classifier count that is not a map is no
 * class at all, rather than a bucket named after a stray value.
 * @param {any} value */
function classesOf(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/** @param {Record<string, { n: number, disagreed: number }>} into
 * @param {string} key @param {boolean} bad */
function bump(into, key, bad) {
  const bucket = (into[key] ??= { n: 0, disagreed: 0 });
  bucket.n += 1;
  bucket.disagreed += bad ? 1 : 0;
}

/** @param {Map<string, any> | Record<string, any>} into @param {string} key
 * @param {() => any} make */
function take(into, key, make) {
  if (into instanceof Map) {
    if (!into.has(key)) into.set(key, make());
    return into.get(key);
  }
  return (into[key] ??= make());
}

/** @param {number} bad @param {number} n */
function rate(bad, n) {
  return n === 0 ? 0 : bad / n;
}

/**
 * Each bucket with its verdict against the policy's own thresholds: `ready`
 * only once the window is full and the rate is at or under the cap.
 * @param {Record<string, { n: number, disagreed: number }>} buckets
 * @param {{ window: number, maxFalseAuto: number }} thresholds
 */
function rates(buckets, thresholds) {
  return Object.entries(buckets)
    .map(([name, bucket]) => ({
      name,
      n: bucket.n,
      disagreed: bucket.disagreed,
      rate: rate(bucket.disagreed, bucket.n),
      ready:
        bucket.n >= thresholds.window &&
        rate(bucket.disagreed, bucket.n) <= thresholds.maxFalseAuto,
    }))
    .sort(
      (left, right) => right.n - left.n || left.name.localeCompare(right.name),
    );
}

/** One table per policy hash and route. @param {any} model */
export function renderCalibration(model) {
  const lines = [
    `calibration — ${model.repo}${model.since ? ` since ${model.since}` : ""}`,
    `  ${model.events} dry-run event(s) from the ${model.sink} sink, window ${model.thresholds.window}, max false-auto ${percent(model.thresholds.maxFalseAuto)}${
      model.unreadable ? `, ${model.unreadable} unreadable` : ""
    }`,
  ];
  if (model.groups.length === 0) {
    lines.push("", "  nothing to calibrate: no dry run would have merged yet");
    return lines.join("\n");
  }
  for (const group of model.groups) {
    for (const route of group.routes) {
      // One column width across both tables, so a reader's eye tracks down.
      const width = Math.max(
        8,
        ...[...route.byClass, ...route.byRule].map(
          (/** @type {any} */ row) => row.name.length,
        ),
      );
      lines.push(
        "",
        `  policy ${group.policyHash} — would: ${route.would} (${percent(route.rate)} false-auto over ${route.n})`,
        `      ${"".padEnd(width)}  false-auto      n  verdict`,
      );
      lines.push(...table("by class", route.byClass, width));
      lines.push(...table("by rule", route.byRule, width));
    }
  }
  return lines.join("\n");
}

/** @param {string} heading @param {any[]} rows @param {number} width */
function table(heading, rows, width) {
  if (rows.length === 0) return [`    ${heading}: none`];
  return [
    `    ${heading}`,
    ...rows.map(
      (row) =>
        `      ${row.name.padEnd(width)}  ${percent(row.rate).padStart(10)}  ${String(row.n).padStart(5)}  ${row.ready ? "ready" : "hold"}`,
    ),
  ];
}

/** @param {number} value */
function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}
