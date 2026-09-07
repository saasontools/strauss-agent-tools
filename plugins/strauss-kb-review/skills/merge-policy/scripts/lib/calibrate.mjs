// @ts-check
/**
 * The calibration loop's read side: the false-auto rate per class and per rule,
 * over a dump of pull requests a caller collected with `gh`.
 *
 * A rate that can flip a class to `auto` must not be forgeable: only the bot's
 * own sticky comment carries a verdict, and only a named human's 👎 counts.
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

/** Who posts the sticky when `--bot-logins` names nobody. */
const DEFAULT_BOT = "github-actions[bot]";

/**
 * The `calibration` thresholds and the hash of the policy at `rev`, or the
 * built-in defaults and no hash for a policy that is absent or would not parse.
 * Read from the working branch and not from a base: this report gates nothing,
 * so a branch's own numbers can only ever change what a table prints.
 * @param {(args: string[]) => string | null} show `git show <rev>:<path>`
 * @param {string} rev @param {string | null} policyPath
 * @returns {{ thresholds: { window: number, maxFalseAuto: number },
 *   hash: string | null }}
 */
export function policyAt(show, rev, policyPath) {
  const policy = readPolicy(
    show,
    rev,
    policyPath ? [policyPath] : POLICY_PATHS,
  );
  if (policy.errors.length > 0) {
    return { thresholds: { ...CALIBRATION_DEFAULTS }, hash: null };
  }
  return { thresholds: policy.data.calibration, hash: policy.hash };
}

/** The last comment this step owns, which is the one a rerun left standing.
 * The marker is text anyone can type, so only a `--bot-logins` author may own
 * one: a verdict a reader forged must not move the rate.
 * @param {unknown} comments @param {string[]} [botLogins] @returns {any} */
export function stickyOf(comments, botLogins = []) {
  const owners = new Set(
    (botLogins.length > 0 ? botLogins : [DEFAULT_BOT]).map((login) =>
      asString(login).toLowerCase(),
    ),
  );
  const owned = asArray(comments).filter(
    (comment) =>
      asString(/** @type {any} */ (comment)?.body)
        .trimStart()
        .startsWith(MARKER) && owners.has(authorOf(comment).toLowerCase()),
  );
  return owned.length > 0 ? owned[owned.length - 1] : null;
}

/** The login on a comment, as GraphQL and as REST each name it.
 * @param {unknown} comment */
function authorOf(comment) {
  const row = /** @type {any} */ (comment);
  return asString(row?.author?.login) || asString(row?.user?.login);
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

/** The reactions a dump names a reactor for: a REST array with a user on every
 * row, or `reactionGroups` that listed their users. A bare `totalCount` names
 * nobody, so it is no signal — a bot could be the whole count.
 * @param {any} comment */
function reactionsOf(comment) {
  const rest = asArray(comment?.reactions);
  if (rest.length > 0) return rest;
  return asArray(comment?.reactionGroups).flatMap((group) =>
    asString(/** @type {any} */ (group)?.content) === THUMBS_DOWN
      ? asArray(/** @type {any} */ (group)?.users?.nodes).map((user) => ({
          content: "-1",
          user,
        }))
      : [],
  );
}

/**
 * One observation per pull request: the verdict its sticky comment carries, and
 * whether a human contradicted it. A PR with no verdict — no comment yet, one
 * still withheld, one unreadable — is no observation, never a silent agreement.
 * @param {unknown} entries @param {string[]} [botLogins]
 * @returns {{ rows: any[], noComment: number, withheld: number,
 *   unreadable: number }}
 */
export function observations(entries, botLogins = []) {
  /** @type {any[]} */
  const rows = [];
  const skipped = { noComment: 0, withheld: 0, unreadable: 0 };
  for (const entry of asArray(entries)) {
    const sticky = stickyOf(/** @type {any} */ (entry)?.comments, botLogins);
    if (!sticky) {
      skipped.noComment += 1;
      continue;
    }
    const verdict = parseVerdict(sticky.body);
    const would = asString(verdict?.would);
    if (!would) {
      if (verdict) skipped.withheld += 1;
      else skipped.unreadable += 1;
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
  return { rows, ...skipped };
}

/**
 * The false-auto rate: of the PRs this policy would have merged unattended, how
 * many a human said it should not have. Grouped by the config hash the verdict
 * was made under, so a policy change starts the count over rather than carrying
 * its own history — and only the group matching `currentHash` may be `ready`.
 * @param {any[]} rows
 * @param {{ window: number, maxFalseAuto: number }} thresholds
 * @param {string | null} [currentHash] the hash of the policy at HEAD
 */
export function calibrate(rows, thresholds, currentHash = null) {
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
    .map((group) => {
      const current = currentHash !== null && group.policyHash === currentHash;
      return {
        policyHash: group.policyHash,
        current,
        routes: Object.values(group.routes)
          .map((/** @type {any} */ route) => ({
            would: route.would,
            n: route.prs,
            disagreed: route.disagreed,
            rate: rate(route.disagreed, route.prs),
            byClass: rates(route.byClass, thresholds, current),
            byRule: rates(route.byRule, thresholds, current),
          }))
          .sort((left, right) => left.would.localeCompare(right.would)),
      };
    })
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
 * only under the current policy, once the minimum is met and the rate is at or
 * under the cap.
 * @param {Record<string, { n: number, disagreed: number }>} buckets
 * @param {{ window: number, maxFalseAuto: number }} thresholds
 * @param {boolean} current
 */
function rates(buckets, thresholds, current) {
  return Object.entries(buckets)
    .map(([name, bucket]) => ({
      name,
      n: bucket.n,
      disagreed: bucket.disagreed,
      rate: rate(bucket.disagreed, bucket.n),
      ready:
        current &&
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
    `  ${model.verdicts} verdict(s) over ${model.prs} pull request(s), minimum ${model.thresholds.window} observation(s) per class, max false-auto ${percent(model.thresholds.maxFalseAuto)}`,
    ...skipped(model),
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
        `  policy ${group.policyHash} — ${group.current ? "current" : "stale (policy changed)"} — would: ${route.would} (${percent(route.rate)} false-auto over ${route.n})`,
        `      ${"".padEnd(width)}  false-auto      n  verdict`,
      );
      lines.push(...table("by class", route.byClass, width));
      lines.push(...table("by rule", route.byRule, width));
    }
  }
  return lines.join("\n");
}

/** The PRs this dump held no verdict for, each named only when it happened.
 * @param {any} model */
function skipped(model) {
  return [
    [model.noComment, "with no comment yet"],
    [model.withheld, "still withheld"],
    [model.unreadable, "with an unreadable verdict"],
  ]
    .filter(([count]) => Number(count) > 0)
    .map(([count, why]) => `  ${count} ${why}`);
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
