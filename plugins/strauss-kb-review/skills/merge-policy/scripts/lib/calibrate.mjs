// @ts-check
/**
 * The calibration loop's read side: the false-auto rate per class and per rule,
 * over a dump of pull requests a caller collected with `gh`.
 *
 * The sticky comment is where a dry-run verdict is persisted, so the verdict is
 * parsed back out of it and the disagreement is read off the same PR's labels
 * and the reactions on that comment.
 */
import { asArray, asString } from "../../../../hooks/scripts/lib/util.mjs";
import { disagreement } from "./dry-run.mjs";
import { CALIBRATION_DEFAULTS, POLICY_PATHS, readPolicy } from "./policy.mjs";
import { UNATTENDED } from "./record.mjs";
import { MARKER, VERDICT_MARKER } from "./report.mjs";

/** The fenced JSON the sticky comment carries its verdict in. */
const FENCE = /```json\s*\r?\n([\s\S]*?)\r?\n```/;

/** GraphQL names a reaction; the REST dumps and this step spell it `-1`. */
const THUMBS_DOWN = "THUMBS_DOWN";

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

/** The last comment this step owns, which is the one a rerun left standing.
 * @param {unknown} comments @returns {any} */
export function stickyOf(comments) {
  const owned = asArray(comments).filter((comment) =>
    asString(/** @type {any} */ (comment)?.body)
      .trimStart()
      .startsWith(MARKER),
  );
  return owned.length > 0 ? owned[owned.length - 1] : null;
}

/** The verdict out of one sticky comment's fenced JSON, or null for a comment
 * carrying none — a withheld run posts a placeholder with no route in it.
 * @param {unknown} body @returns {any} */
export function parseVerdict(body) {
  const text = asString(body);
  const at = text.indexOf(VERDICT_MARKER);
  if (at < 0) return null;
  const hit = FENCE.exec(text.slice(at));
  if (!hit) return null;
  try {
    return JSON.parse(hit[1] ?? "");
  } catch {
    return null;
  }
}

/** Either shape a dump carries: `gh pr list`'s `reactionGroups`, which count
 * reactors without naming them, or a REST array with a user on every row.
 * @param {any} comment */
function reactionsOf(comment) {
  const rest = asArray(comment?.reactions);
  if (rest.length > 0) return rest;
  return asArray(comment?.reactionGroups).flatMap((group) =>
    asString(/** @type {any} */ (group)?.content) === THUMBS_DOWN &&
    Number(/** @type {any} */ (group)?.users?.totalCount ?? 0) > 0
      ? [{ content: "-1" }]
      : [],
  );
}

/**
 * One observation per pull request: the verdict its sticky comment carries, and
 * whether a human contradicted it. A PR with no verdict — no comment yet, or
 * one still withheld — is no observation, never a silent agreement.
 * @param {unknown} entries @param {string[]} [botLogins]
 * @returns {{ rows: any[], noVerdict: number }}
 */
export function observations(entries, botLogins = []) {
  /** @type {any[]} */
  const rows = [];
  let noVerdict = 0;
  for (const entry of asArray(entries)) {
    const sticky = stickyOf(/** @type {any} */ (entry)?.comments);
    const verdict = sticky ? parseVerdict(sticky.body) : null;
    const would = asString(verdict?.would);
    if (!would) {
      noVerdict += 1;
      continue;
    }
    rows.push({
      pr: /** @type {any} */ (entry)?.number ?? null,
      would,
      rule: asString(verdict.rule) || "no rule",
      policyHash: asString(verdict.policyHash) || "no hash",
      classes: verdict.classes,
      ...disagreement(
        /** @type {any} */ (entry)?.labels,
        reactionsOf(sticky),
        botLogins,
      ),
    });
  }
  return { rows, noVerdict };
}

/**
 * The false-auto rate: of the PRs this policy would have merged unattended, how
 * many a human said it should not have. Grouped by the config hash the verdict
 * was made under, so a policy change starts the count over rather than carrying
 * its own history.
 * @param {any[]} rows
 * @param {{ window: number, maxFalseAuto: number }} thresholds
 */
export function calibrate(rows, thresholds) {
  /** @type {Map<string, any>} */
  const groups = new Map();
  for (const row of rows) {
    if (!UNATTENDED.includes(row.would)) continue;
    const hash = asString(row.policyHash) || "no hash";
    const group = take(groups, hash, () => ({ policyHash: hash, routes: {} }));
    const route = take(group.routes, row.would, () => ({
      would: row.would,
      prs: 0,
      disagreed: 0,
      byClass: {},
      byRule: {},
    }));
    const bad = row.disagreement === true;
    route.prs += 1;
    route.disagreed += bad ? 1 : 0;
    bump(route.byRule, asString(row.rule) || "no rule", bad);
    for (const name of Object.keys(classesOf(row.classes))) {
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
    `calibration — ${model.dump}`,
    `  ${model.verdicts} verdict(s) over ${model.prs} pull request(s), window ${model.thresholds.window}, max false-auto ${percent(model.thresholds.maxFalseAuto)}${
      model.noVerdict ? `, ${model.noVerdict} with no verdict` : ""
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
