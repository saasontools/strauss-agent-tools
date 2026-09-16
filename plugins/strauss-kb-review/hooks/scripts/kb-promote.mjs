#!/usr/bin/env node
// @ts-check
/**
 * `promote --to review|repo` — the two hops between the review flow's three
 * bases. Selection is by rule (`lib/promote/select.mjs`); every write goes
 * through `strauss-kb promote`, so no record's body is ever rewritten here.
 *
 * Usage:
 *   promote --to review|repo [--from <bundle>] [--to-bundle <bundle>]
 *           [--range <base>..HEAD] [--dry-run] [--report <path>]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readBase, standings, withStandings } from "./lib/base.mjs";
import { launcher, run, setDeadline } from "./lib/cli.mjs";
import { git } from "./lib/git.mjs";
import { testPaths } from "./lib/promote/classes.mjs";
import { renderReport } from "./lib/promote/report.mjs";
import {
  isFinding,
  isOpenFinding,
  reviewerActors,
  selectForRepo,
  selectForReview,
} from "./lib/promote/select.mjs";
import { readTrailers } from "./lib/promote/trailers.mjs";

/** The three bases, committed while SAA-722 is open. */
export const LEVELS = {
  scratch: join(".strauss", "scratch"),
  review: join(".strauss", "review"),
  repo: join(".strauss", "kb"),
};

/** What each copy keeps on the way into the base a human reads. */
const REVIEW_CARRY = "status,verified,tags";

/** Concept ids per `promote` call — the schema's ceiling, so fewest spawns. */
const CHUNK = 64;

/** Wall budget for the whole hop, as the two gates have one. */
const WALL_MS = 120_000;

/** `<type>.<slug>`, both kebab-case — `KB_SLUG_PATTERN` either side of the dot. */
const CONCEPT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * @typedef {{ to: string, from?: string, toBundle?: string, range?: string,
 *   dryRun: boolean, report?: string }} Options
 */

/** @param {string[]} argv @returns {Options} */
export function parseArgs(argv) {
  const words = argv[0] === "promote" ? argv.slice(1) : argv;
  const flag = (/** @type {string} */ name) => {
    const at = words.indexOf(name);
    if (at === -1) return undefined;
    const value = words[at + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${name} needs a value`);
    }
    return value;
  };
  const to = flag("--to");
  if (to !== "review" && to !== "repo") {
    throw new Error("--to takes review or repo");
  }
  const from = flag("--from");
  const toBundle = flag("--to-bundle");
  const range = flag("--range");
  const report = flag("--report");
  return {
    to,
    ...(from !== undefined ? { from } : {}),
    ...(toBundle !== undefined ? { toBundle } : {}),
    ...(range !== undefined ? { range } : {}),
    ...(report !== undefined ? { report } : {}),
    dryRun: words.includes("--dry-run"),
  };
}

/**
 * The bases a hop reads and writes, and where its report lands. The level-2
 * base owns the report in both hops: it is what a human reads.
 * @param {string} cwd @param {Options} options
 */
export function bundles(cwd, options) {
  const at = (/** @type {string} */ path) =>
    isAbsolute(path) ? path : resolve(cwd, path);
  const review = at(
    options.to === "review"
      ? (options.toBundle ?? LEVELS.review)
      : (options.from ?? LEVELS.review),
  );
  const from = at(
    options.to === "review"
      ? (options.from ?? LEVELS.scratch)
      : (options.from ?? LEVELS.review),
  );
  const to = at(
    options.to === "review"
      ? (options.toBundle ?? LEVELS.review)
      : (options.toBundle ?? LEVELS.repo),
  );
  return {
    from,
    to,
    review,
    report: options.report ? at(options.report) : join(review, "REPORT.md"),
  };
}

/**
 * The roster names `.strauss/kb-pins.json` holds, or null when the file cannot
 * be read. The difference matters: an empty roster makes every finding guard
 * vacuous, so the hop refuses rather than run without one.
 * @param {string} cwd @returns {string[] | null}
 */
export function roster(cwd) {
  try {
    const raw = readFileSync(join(cwd, ".strauss", "kb-pins.json"), "utf8");
    const pins = /** @type {any} */ (JSON.parse(raw));
    const names = Object.keys(pins?.reviewers ?? {});
    return names.length ? names : null;
  } catch {
    return null;
  }
}

/**
 * The range the trailers are read over. With none given it is the branch: what
 * this pull request did, not the repository's whole history.
 * @param {string} cwd @param {string | undefined} given @returns {string[]}
 */
export function rangeOf(cwd, given) {
  if (given) return [given];
  for (const ref of ["origin/main", "main"]) {
    const base = git(cwd, ["merge-base", ref, "HEAD"]);
    const sha = (base ?? "").trim();
    if (sha) return [`${sha}..HEAD`];
  }
  return [];
}

/** Paths git still tracks at HEAD — what a "live" anchor points at. @param {string} cwd */
export function trackedPaths(cwd) {
  const out = git(cwd, ["ls-files", "--cached"]);
  return new Set((out ?? "").split("\n").filter(Boolean));
}

/**
 * Why each record was closed, from the source base's own log. The status says
 * a risk is settled; only the log entry says what settled it.
 * @param {import("./lib/cli.mjs").Launcher} kb @returns {Map<string, string>}
 */
export function closingReasons(kb) {
  /** @type {Map<string, string>} */
  const reasons = new Map();
  const result = run(kb, ["log"]);
  if (result.missing || result.unknownVerb) return reasons;
  /** @type {any} */
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return reasons;
  }
  for (const entry of parsed?.entries ?? []) {
    const row = /** @type {any} */ (entry);
    if (typeof row?.operation !== "string") continue;
    if (!row.operation.startsWith("status:")) continue;
    if (typeof row.reason === "string" && row.reason) {
      reasons.set(String(row.conceptId), row.reason);
    }
  }
  return reasons;
}

/** @param {string[]} ids @returns {string[][]} */
function chunked(ids) {
  /** @type {string[][]} */
  const groups = [];
  for (let at = 0; at < ids.length; at += CHUNK) {
    groups.push(ids.slice(at, at + CHUNK));
  }
  return groups;
}

/**
 * @param {{ cwd: string, argv: string[],
 *   write?: (path: string, text: string) => void }} input
 * @returns {{ status: number, lines: string[], report: string }}
 */
export function promote({ cwd, argv, write = writeFile }) {
  const options = parseArgs(argv);
  const paths = bundles(cwd, options);
  const names = roster(cwd);
  if (!names) {
    return {
      status: 1,
      lines: [
        "promote: no reviewer roster in .strauss/kb-pins.json — every finding would read as nobody's",
      ],
      report: "",
    };
  }
  const reviewers = reviewerActors(names);
  const range = rangeOf(cwd, options.range);

  setDeadline(Date.now() + WALL_MS);
  const source = launcher(cwd, paths.from);
  // The directory read answers "is there anything here" without a subprocess,
  // so an empty base costs none.
  const found = readBase(paths.from);
  if (!found.length) {
    return {
      status: 1,
      lines: [`promote: ${paths.from} holds no records`],
      report: "",
    };
  }
  const records = withStandings(found, standings(source));

  const anchored = records.flatMap((record) =>
    record.anchors.map((anchor) => String(anchor?.file ?? "")),
  );
  const selection =
    options.to === "review"
      ? selectForReview(records, reviewers, testPaths(cwd, anchored))
      : selectForRepo(records, anchorLive(trackedPaths(cwd)));

  // A finding left behind is the one outcome this command must not produce.
  // At the merge hop level 2 is deleted, so an unanswered one has to be
  // settled or accepted first; at the review hop the rules take them all.
  const lost =
    options.to === "repo"
      ? records
          .filter((record) => isOpenFinding(record, reviewers))
          .map((record) => ({
            conceptId: record.conceptId,
            why: record.status,
          }))
      : selection.left
          .filter((row) => row.finding)
          .map((row) => ({ conceptId: row.record.conceptId, why: row.why }));
  if (lost.length) {
    return {
      status: 1,
      lines: [
        "promote: refusing to drop a reviewer's finding:",
        ...lost.map((row) => `  ${row.conceptId} — ${row.why}`),
      ],
      report: "",
    };
  }

  const ids = selection.taken.map((row) => row.record.conceptId);
  // A concept id reaches the child as a positional. `argvFlag` scans the whole
  // argv, so a record named `--to=…` would redirect the run and still report
  // success — the grammar, checked here, is what stops it.
  const malformed = ids.filter((id) => !CONCEPT_ID.test(id));
  if (malformed.length) {
    return {
      status: 1,
      lines: [
        `promote: ${paths.from} holds a file that is not <type>.<slug>.md:`,
        ...malformed.map((id) => `  ${id}`),
      ],
      report: "",
    };
  }
  /** @type {string[]} */
  const promoted = [];
  /** @type {{ conceptId: string, settledBy: string }[]} */
  const skipped = [];
  /** @type {string[]} */
  const lines = [];

  if (!options.dryRun && ids.length) {
    for (const group of chunked(ids)) {
      // Flags first: `argvFlag` takes the first `--to` it finds, so the hop's
      // own must sit ahead of anything derived from the base.
      const result = run(source, [
        "promote",
        "--to",
        paths.to,
        "--on-conflict",
        "skip-human-settled",
        ...(options.to === "review" ? ["--carry", REVIEW_CARRY] : []),
        "--json",
        ...group,
      ]);
      if (result.status !== 0) {
        return {
          status: result.status || 1,
          lines: [...lines, `promote: ${result.stderr.trim() || "failed"}`],
          report: "",
        };
      }
      // Past the budget `run` refuses unrun and reports no output. Told apart
      // from a broken result, because the two want different answers.
      if (result.missing) {
        return {
          status: 1,
          lines: [
            ...lines,
            `promote: over its ${WALL_MS / 1000}s budget — ${promoted.length} records landed`,
          ],
          report: "",
        };
      }
      /** @type {any} */
      let parsed;
      try {
        parsed = JSON.parse(result.stdout);
      } catch {
        return {
          status: 1,
          lines: [...lines, "promote: the CLI printed no result"],
          report: "",
        };
      }
      for (const entry of parsed?.promoted ?? []) {
        promoted.push(String(/** @type {any} */ (entry).conceptId));
      }
      for (const entry of parsed?.skipped ?? []) {
        const row = /** @type {any} */ (entry);
        skipped.push({
          conceptId: String(row.conceptId),
          settledBy: String(row.settledBy),
        });
      }
    }
  }

  // The rules chose it and the store did not take it: the caller is told rather
  // than handed a level 2 with a hole in it.
  if (!options.dryRun) {
    const landed = new Set([
      ...promoted,
      ...skipped.map((row) => row.conceptId),
    ]);
    const missing = selection.taken
      .filter((row) => isFinding(row.record, reviewers))
      .map((row) => row.record.conceptId)
      .filter((id) => !landed.has(id));
    if (missing.length) {
      return {
        status: 1,
        lines: [
          "promote: a finding was selected but never landed:",
          ...missing.map((id) => `  ${id}`),
        ],
        report: "",
      };
    }
  }

  // The report describes the base it sits in. Read fresh after the writes, so
  // a record `skip-human-settled` left alone is reported as the human left it
  // and its closing reason comes from that base's own log.
  const shown = describing(cwd, paths, options, records, selection);
  const report = renderReport({
    to: paths.to,
    hop: options.to,
    range,
    taken: shown.taken,
    left: selection.left,
    promoted: options.dryRun ? ids : promoted,
    skipped,
    trailers: readTrailers(cwd, range),
    reasons: shown.reasons,
    dryRun: options.dryRun,
  });
  // A dry run writes nothing unless `--report` named where: the point of the
  // rehearsal is that `.strauss/review` is untouched.
  const writing = !options.dryRun || options.report !== undefined;
  if (writing) write(paths.report, report);

  lines.push(
    `${options.dryRun ? "Would promote" : "Promoted"} ${
      options.dryRun ? ids.length : promoted.length
    } of ${records.length} records into ${paths.to}.`,
  );
  for (const row of skipped) {
    lines.push(`  ${row.conceptId} left alone (settled by ${row.settledBy})`);
  }
  if (writing) lines.push(`Report: ${paths.report}`);
  return { status: 0, lines, report };
}

/**
 * The level-2 base as it now stands, or — on a rehearsal, where it has not been
 * written — the selection that would produce it.
 * @param {string} cwd @param {ReturnType<typeof bundles>} paths
 * @param {Options} options @param {import("./lib/base.mjs").BaseRecord[]} records
 * @param {import("./lib/promote/select.mjs").Selection} selection
 */
function describing(cwd, paths, options, records, selection) {
  const ids = new Set(selection.taken.map((row) => row.record.conceptId));
  const source = launcher(cwd, paths.from);
  if (options.dryRun) {
    const taken =
      options.to === "repo"
        ? records.map((record) => ({ record, why: "at level 2" }))
        : selection.taken;
    return { taken, reasons: closingReasons(source) };
  }
  const level2 = launcher(cwd, paths.review);
  const held = withStandings(readBase(paths.review), standings(level2));
  return {
    taken: held
      .filter((record) => options.to === "repo" || ids.has(record.conceptId))
      .map((record) => ({ record, why: "at level 2" })),
    reasons: closingReasons(level2),
  };
}

/** @param {Set<string>} tracked */
function anchorLive(tracked) {
  return (/** @type {import("./lib/util.mjs").Anchor} */ anchor) =>
    typeof anchor?.file === "string" && tracked.has(anchor.file);
}

/** @param {string} path @param {string} text */
function writeFile(path, text) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, text, "utf8");
}

// Run only when invoked directly. `pathToFileURL` is what makes the comparison
// hold on Windows, where an absolute path is not a URL.
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    const result = promote({ cwd: process.cwd(), argv: process.argv.slice(2) });
    process.stdout.write(`${result.lines.join("\n")}\n`);
    process.exit(result.status);
  } catch (error) {
    process.stderr.write(
      `promote: ${error instanceof Error ? error.message : "failed"}\n`,
    );
    process.exit(2);
  }
}
