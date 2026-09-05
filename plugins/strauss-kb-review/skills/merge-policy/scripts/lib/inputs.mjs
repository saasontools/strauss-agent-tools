// @ts-check
/**
 * Everything the rules read, gathered once. Nothing here judges; every field
 * is a fact about the range, the base rev, or an input file the caller passed.
 *
 * Every read goes through the injected `run`, so a unit test hands the rules a
 * repository it wrote by hand.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, posix, relative } from "node:path";
import {
  asArray,
  asString,
  parseFrontmatter,
} from "../../../../hooks/scripts/lib/util.mjs";
import { builtinClass } from "../../../../hooks/scripts/lib/classify.mjs";
import {
  CODEOWNERS_PATHS,
  codeownersCover,
  effectiveMateriality,
  matchesAny,
  POLICY_PATHS,
  readPolicy,
} from "./policy.mjs";

/**
 * @typedef {{ show: (args: string[]) => string | null,
 *   git: (args: string[]) => string | null,
 *   kb: (args: string[]) => unknown,
 *   gate: () => any,
 *   bundleFiles: () => { path: string, name: string }[],
 *   readBundle: (name: string) => string | null }} Run
 * @typedef {ReturnType<typeof gather>} Input
 */

/** Import and require specifiers, for the crossing check. */
const IMPORT = /(?:from|import|require)\s*\(?\s*["']([^"']+)["']/g;

/**
 * @param {{ base: string, head: string, headSha: string, repoRoot: string,
 *   bundleDir: string, policyPath: string | null, reviewer: any,
 *   approvals: any[], gateSupplied?: boolean,
 *   defaults?: { path: string, text: string | null } | null }} options
 * @param {Run} run
 */
export function gather(options, run) {
  const paths = options.policyPath ? [options.policyPath] : POLICY_PATHS;
  const rows = changedFiles(run, options.base, options.head);
  const changed = rows.map((row) => row.path);
  // The changed paths decide which `overrides` entries apply, so the policy is
  // read after the diff and not before it.
  const policy = readPolicy(run.show, options.base, paths, {
    defaults: options.defaults ?? null,
    changed,
  });
  const classes = classify(run, options.base, options.head, rows);

  const files = changed.map((path) => ({
    path,
    class: classes.get(path) ?? builtinClass(path),
    excluded: matchesAny(path, policy.data.exclude),
    crosses: false,
  }));
  crossings(run, options.head, files, policy);
  codeowners(run, options.base, policy);

  const { records, unreadable } = readRecords(run, changed, policy.data.floors);
  const log = asArray(/** @type {any} */ (run.kb(["log"]))?.entries);
  const matched = matchIds(run, options.base, options.head);
  for (const record of records) {
    record.onDiff = record.touched || matched.has(record.id);
    record.verifiedBy = verifiers(record, log);
  }

  return {
    base: options.base,
    head: options.head,
    headSha: options.headSha,
    policy,
    policyChanged: changed.some((path) => paths.includes(path)),
    files,
    records,
    unreadable,
    deleted: deletedRecords(run, options.base, options.bundleDir, records, log),
    unearned: unearnedResolutions(records, log),
    gate: gateReport(run, options.gateSupplied === true),
    reviewer: reviewer(options.reviewer),
    approvals: approvals(options.approvals),
    log,
  };
}

/** @param {Run} run @param {string} base @param {string} head
 *  @returns {{ path: string, status: string }[]} */
function changedFiles(run, base, head) {
  const out = run.git([
    "diff",
    "--no-color",
    "--no-ext-diff",
    "--no-textconv",
    "--name-status",
    "-M",
    "--end-of-options",
    `${base}..${head}`,
    "--",
  ]);
  /** @type {{ path: string, status: string }[]} */
  const rows = [];
  for (const line of (out ?? "").split("\n").filter(Boolean)) {
    const parts = line.split("\t");
    const status = (parts[0] ?? "").trim();
    if (status.startsWith("R") && parts[2])
      rows.push({ path: parts[2], status: "R" });
    else if (parts[1]) rows.push({ path: parts[1], status: status.charAt(0) });
  }
  return rows;
}

/**
 * `classify --git` answers `{ files: [{ filePath, class }] }`; the built-in
 * patterns, and `-M`'s rename status, stand in per path the verb did not name.
 * @param {Run} run @param {string} base @param {string} head
 * @param {{ path: string, status: string }[]} rows
 */
function classify(run, base, head, rows) {
  /** @type {Map<string, string>} */
  const classes = new Map(
    rows.map((row) => [row.path, builtinClass(row.path)]),
  );
  for (const row of rows) {
    if (row.status === "R") classes.set(row.path, "rename");
  }
  const answer = /** @type {any} */ (
    run.kb(["classify", "--git", `${base}..${head}`, "--offline", "--json"])
  );
  for (const row of asArray(answer?.files)) {
    const path = asString(/** @type {any} */ (row).filePath);
    const name = asString(/** @type {any} */ (row).class);
    if (path && name) classes.set(path, name);
  }
  return classes;
}

/** Concept ids `match` places on a hunk of the range, open ones included.
 * @param {Run} run @param {string} base @param {string} head */
function matchIds(run, base, head) {
  /** @type {Set<string>} */
  const ids = new Set();
  const answer = run.kb([
    "match",
    "--git",
    `${base}..${head}`,
    "--offline",
    "--include-non-current",
  ]);
  for (const hunk of asArray(answer)) {
    for (const record of asArray(/** @type {any} */ (hunk).records)) {
      const id = asString(/** @type {any} */ (record).conceptId);
      if (id) ids.add(id);
    }
  }
  return ids;
}

/**
 * The bundle at head, with the frontmatter fields no read verb returns:
 * `strauss_assumption`, `verified[]` and `strauss_verify`. A record that would
 * not read is named in `unreadable`, never left out silently.
 * @param {Run} run @param {string[]} changed @param {Record<string, string>} floors
 */
function readRecords(run, changed, floors) {
  const touched = new Set(changed);
  /** @type {string[]} */
  const unreadable = [];
  const records = run.bundleFiles().flatMap((entry) => {
    const { path, name } = entry;
    const text = run.readBundle(name);
    if (text === null) {
      unreadable.push(name.slice(0, -3));
      return [];
    }
    const { data } = parseFrontmatter(text);
    const tags = asArray(data.tags).map(String);
    const materiality = asString(data.strauss_materiality) || undefined;
    return {
      id: name.slice(0, -3),
      type: asString(data.type) || name.split(".")[0] || "",
      materiality: materiality ?? null,
      effective: effectiveMateriality(materiality, tags, floors),
      status: asString(data.strauss_status) || "accepted",
      tags,
      assumption: data.strauss_assumption === true,
      verify: asArray(data.strauss_verify).map(String),
      writtenBy: asString(/** @type {any} */ (data.generated)?.by) || null,
      verifiedFrontmatter: asArray(data.verified),
      /** @type {string[]} */ verifiedBy: [],
      touched: touched.has(path),
      onDiff: false,
    };
  });
  return { records, unreadable };
}

/**
 * Which exclusions hold. An excluded file that imports an included one is
 * evaluated as included: the change there pins the shape of a reviewed file.
 * `review.crossing: off` makes the exclusion final and reads no edges, and
 * either way `notChecked` says what was not read.
 * @param {Run} run @param {string} head
 * @param {{ path: string, excluded: boolean, crosses: boolean }[]} files
 * @param {import("./policy.mjs").Policy} policy
 */
function crossings(run, head, files, policy) {
  const off = policy.data.crossing === "off";
  /** @type {string[]} */
  const unread = [];
  for (const file of files) {
    if (!file.excluded || off) continue;
    const seen = crosses(run, head, file.path, policy.data);
    file.crosses = seen.crosses;
    if (!seen.read) unread.push(file.path);
  }
  if (policy.data.exclude.length === 0) return;
  policy.notChecked.push(
    off
      ? "excluded paths: review.crossing is off, so no import edge was read"
      : "excluded paths: inbound edges not checked",
  );
  if (unread.length > 0) {
    policy.notChecked.push(
      `excluded paths: import edges unreadable at head: ${unread.join(", ")}`,
    );
  }
}

/**
 * A CODEOWNERS at the base that puts no owner on the policy file. A warning
 * and never a route: who owns a path is GitHub's business, and this step
 * already sends any touched policy to a human.
 * @param {Run} run @param {string} base
 * @param {import("./policy.mjs").Policy} policy
 */
function codeowners(run, base, policy) {
  if (!policy.path) return;
  for (const path of CODEOWNERS_PATHS) {
    const text = run.show([`${base}:${path}`]);
    if (text === null) continue;
    if (!codeownersCover(text, policy.path)) {
      policy.notChecked.push(
        `${path}: no owner on ${policy.path}, so a change there needs no named reviewer`,
      );
    }
    return;
  }
}

/**
 * Actors that verified a record and did not write it. A policy-listed verifier
 * is no exception: its verify on its own record is still the author's word.
 * @param {{ id: string, writtenBy: string | null, verifiedFrontmatter: unknown[] }} record
 * @param {any[]} log */
function verifiers(record, log) {
  /** @type {Set<string>} */
  const actors = new Set();
  for (const event of record.verifiedFrontmatter) {
    const by = asString(/** @type {any} */ (event)?.by);
    if (by) actors.add(by);
  }
  for (const entry of log) {
    if (entry?.operation === "verify" && entry?.conceptId === record.id) {
      const by = asString(entry.by);
      if (by) actors.add(by);
    }
  }
  const author = record.writtenBy ?? writerOf(record.id, log);
  return [...actors].filter((actor) => actor !== author);
}

/** @param {string} id @param {any[]} log */
function writerOf(id, log) {
  const write = log.find(
    (entry) => entry?.operation === "write" && entry?.conceptId === id,
  );
  return asString(write?.by) || null;
}

/**
 * A `review` record the log moved to a terminal status with no non-author
 * `verify` behind it. The status is the author's own word, so it counts as
 * still open.
 * @param {ReturnType<typeof readRecords>["records"]} records @param {any[]} log
 */
function unearnedResolutions(records, log) {
  return records
    .filter(
      (record) =>
        record.tags.includes("review") &&
        ["resolved", "rejected"].includes(record.status) &&
        record.verifiedBy.length === 0 &&
        log.some(
          (entry) =>
            entry?.conceptId === record.id &&
            /^status/.test(asString(entry.operation)) &&
            /resolved|rejected/.test(
              asString(entry.operation) + asString(entry.status),
            ),
        ),
    )
    .map((record) => record.id);
}

/**
 * A record the base tree held that is gone at head with no `supersede` and no
 * `status` behind it. Scoped to the base listing: a record this range never
 * inherited cannot have been deleted by it.
 * @param {Run} run @param {string} base @param {string} bundleDir
 * @param {ReturnType<typeof readRecords>["records"]} records @param {any[]} log
 */
function deletedRecords(run, base, bundleDir, records, log) {
  const present = new Set(records.map((record) => record.id));
  /** @type {Set<string>} */
  const atBase = new Set();
  const listing = run.git([
    "ls-tree",
    "--name-only",
    "-r",
    "--end-of-options",
    base,
    "--",
    bundleDir,
  ]);
  for (const path of (listing ?? "").split("\n")) {
    const name = path.split("/").pop() ?? "";
    if (name.endsWith(".md") && name !== "INDEX.md")
      atBase.add(name.slice(0, -3));
  }
  /** @type {Set<string>} */
  const settled = new Set();
  for (const entry of log) {
    const operation = asString(entry?.operation);
    if (/^(supersede|status)(:|$)/.test(operation)) {
      const id = asString(entry?.conceptId);
      if (id) settled.add(id);
    } else if (operation === "supersedes") {
      // Its `conceptId` is the replacement; `target` is the record it settles.
      const target = asString(entry?.target);
      if (target) settled.add(target);
    }
  }
  return [...atBase].filter((id) => !present.has(id) && !settled.has(id));
}

/**
 * The gate's findings, read once and only when a row above it did not already
 * decide the range — `pending` says it was never asked, `answered: false` that
 * it was asked and could not reply.
 * @param {Run} run @param {boolean} supplied
 */
function gateReport(run, supplied) {
  /** @typedef {{ id: string, family: string, file: string | null }} Block */
  /** @type {{ blocks: Block[], warns: Block[], answered: boolean } | null} */
  let state = null;
  const force = () => {
    if (state) return state;
    const report = run.gate();
    const findings = asArray(report?.findings);
    const pick = (/** @type {string} */ severity) =>
      findings
        .filter((item) => /** @type {any} */ (item).severity === severity)
        .map((item) => ({
          id: asString(/** @type {any} */ (item).id),
          family: asString(/** @type {any} */ (item).family),
          file: asString(/** @type {any} */ (item).file) || null,
        }));
    state = {
      blocks: pick("block"),
      warns: pick("warn"),
      answered: report !== null && report !== undefined,
    };
    return state;
  };
  return {
    supplied,
    get pending() {
      return state === null;
    },
    get blocks() {
      return force().blocks;
    },
    get warns() {
      return force().warns;
    },
    get answered() {
      return force().answered;
    },
  };
}

/** @param {any} raw */
function reviewer(raw) {
  if (!raw || typeof raw !== "object") {
    return { present: false, sha: null, verdicts: {}, risksWritten: [] };
  }
  /** @type {Record<string, string>} */
  const verdicts = {};
  for (const [key, value] of Object.entries(raw)) {
    const verdict = asString(/** @type {any} */ (value)?.verdict);
    if (verdict) verdicts[key] = verdict;
  }
  const risksWritten = asArray(raw.written)
    .filter(
      (item) =>
        /** @type {any} */ (item)?.op === "write" &&
        /** @type {any} */ (item)?.type === "risk",
    )
    .map((item) => asString(/** @type {any} */ (item).conceptId));
  return {
    present: true,
    // The agent's output has no sha of its own yet; a runner adds one.
    sha:
      asString(raw.sha) || asString(raw.run?.sha) || asString(raw.head) || null,
    verdicts,
    risksWritten,
  };
}

/** @param {any[]} raw */
function approvals(raw) {
  return asArray(raw).map((row) => ({
    user:
      asString(/** @type {any} */ (row)?.user) ||
      asString(/** @type {any} */ (row)?.user?.login),
    state: asString(/** @type {any} */ (row)?.state).toUpperCase(),
    commit_id: asString(/** @type {any} */ (row)?.commit_id),
  }));
}

/**
 * Does an excluded file import something that is not excluded? `read` is
 * false when the file itself could not be shown, so no edge was seen either
 * way — the caller reports that rather than calling it clean.
 * @param {Run} run @param {string} head @param {string} path
 * @param {import("./policy.mjs").PolicyData} data
 * @returns {{ read: boolean, crosses: boolean }}
 */
function crosses(run, head, path, data) {
  const text = run.show([`${head}:${path}`]);
  if (text === null) return { read: false, crosses: false };
  const dir = posix.dirname(path);
  for (const match of text.matchAll(IMPORT)) {
    const specifier = match[1] ?? "";
    if (!specifier.startsWith(".")) continue;
    const target = posix.normalize(posix.join(dir, specifier));
    if (target.startsWith("..")) continue;
    if (matchesAny(target, data.exclude)) continue;
    if (data.include.length === 0 || matchesAny(target, data.include))
      return { read: true, crosses: true };
  }
  return { read: true, crosses: false };
}

/** The real readers, for the CLI. Tests pass their own.
 * @param {{ repoRoot: string, bundle: string, gate: () => any,
 *   git: (args: string[]) => string | null, kb: (args: string[]) => unknown }} wiring
 * @returns {Run}
 */
export function makeRun(wiring) {
  return {
    git: wiring.git,
    kb: wiring.kb,
    gate: wiring.gate,
    show: (args) =>
      wiring.git(["show", "--no-textconv", "--end-of-options", ...args]),
    bundleFiles: () => {
      /** @type {{ path: string, name: string }[]} */
      let entries = [];
      try {
        entries = readdirSync(wiring.bundle)
          .filter((name) => name.endsWith(".md") && name !== "INDEX.md")
          .map((name) => ({
            name,
            path: relative(wiring.repoRoot, join(wiring.bundle, name))
              .split("\\")
              .join("/"),
          }));
      } catch {
        // No bundle is no records, which the rules read as base silence.
      }
      return entries;
    },
    readBundle: (name) => {
      try {
        return readFileSync(join(wiring.bundle, name), "utf8");
      } catch {
        // Null, never "": an empty record parses as one saying nothing, which
        // routes auto.
        return null;
      }
    },
  };
}
