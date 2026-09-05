// @ts-check
/**
 * The one `ctx` every check reads. Built once: each `strauss-kb` verb is
 * spawned at most once per run, and nothing here is recomputed by a check.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { json, launcher, run } from "./cli.mjs";
import { SKIPPED, classify } from "./classify.mjs";
import * as git from "./git.mjs";
import { readThresholds } from "./thresholds.mjs";
import { asArray, asString, isCodePath, parseFrontmatter } from "./util.mjs";

/**
 * @typedef {import("./util.mjs").KbRecord} KbRecord
 * @typedef {{ file: string, symbol: string | null, hunks: import("./git.mjs").Hunk[] }} ChangedSymbol
 */

/**
 * `offline` defaults on: the hook path runs at Stop and must not fetch a
 * grammar. `--report` passes its own flag either way.
 * @param {{ repoRoot: string, bundle?: string, base: string | null,
 *   head?: string | null, offline?: boolean, report?: boolean }} options
 */
export function buildContext(options) {
  const repoRoot = options.repoRoot;
  const bundle = options.bundle ?? join(repoRoot, ".strauss", "kb");
  const range = git.rangeArgs(options.base, options.head ?? null);
  const kb = launcher(repoRoot, bundle);
  const offline = options.offline ?? true;

  const files = git.changedFiles(repoRoot, range);
  const { classifier, classes } = classify(kb, range, files);
  const hunks = git.hunks(repoRoot, range);
  const changedPaths = new Set(files.map((file) => file.path));
  const bundleDir = relative(repoRoot, bundle).split("\\").join("/");
  // A record written this turn is untracked or unstaged, and a range diff
  // lists neither — it would read as a change nothing covers.
  const writtenPaths = new Set([
    ...changedPaths,
    ...git.uncommittedPaths(repoRoot, bundleDir),
  ]);

  const records = readRecords(bundle, repoRoot, writtenPaths, kb);
  const matchRange = git.matchRange(options.base, options.head ?? null);
  const matches = /** @type {any[]} */ (
    (matchRange.length > 0
      ? json(kb, [
          "match",
          "--git",
          ...matchRange,
          ...(offline ? ["--offline"] : []),
        ])
      : null) ?? []
  );

  return {
    repoRoot,
    bundle,
    range,
    base: options.base,
    head: options.head ?? null,
    offline,
    report: options.report === true,
    classifier,
    classes,
    files,
    changedPaths,
    hunks,
    matches,
    records,
    byId: new Map(records.map((record) => [record.conceptId, record])),
    touched: records.filter((record) => record.touched),
    noDecision:
      records.find((record) => record.conceptId === "decision.none") ?? null,
    changedSymbols: changedSymbols(hunks, matches, classes),
    codeFiles: files.filter(
      (file) =>
        isCodePath(file.path) && !SKIPPED.has(classes.get(file.path) ?? ""),
    ),
    commits: git.commits(repoRoot, range),
    newestCommitAt: newestCommitAt(repoRoot, range),
    log: /** @type {any} */ (json(kb, ["log"]) ?? { entries: [] }),
    logAdded: logAdded(repoRoot, range, bundle),
    validate: /** @type {any[]} */ (json(kb, ["validate"]) ?? []),
    doctor: /** @type {any} */ (
      json(kb, [
        "doctor",
        "--json",
        "--strict",
        "--repo-root",
        repoRoot,
        ...(offline ? ["--offline"] : []),
      ]) ?? { groups: [] }
    ),
    stamp: stampDigest(kb),
    anchorState: anchorState(kb, records, changedPaths, offline),
    thresholds: readThresholds(repoRoot),
    backlinks: memoBacklinks(kb),
    fileAtHead: memoFile(repoRoot),
    repoHas: memoGrep(repoRoot),
    kb,
  };
}

/** Does this identifier appear anywhere tracked? One grep per name, once.
 * @param {string} repoRoot */
function memoGrep(repoRoot) {
  /** @type {Map<string, boolean>} */
  const seen = new Map();
  return (/** @type {string} */ name) => {
    if (!seen.has(name)) {
      // `-e` names the pattern, so an identifier starting with `-` is one.
      const out = git.git(repoRoot, [
        "grep",
        "-I",
        "-l",
        "-F",
        "-e",
        name,
        "--",
      ]);
      seen.set(name, Boolean(out && out.trim()));
    }
    return seen.get(name) ?? false;
  };
}

/** One read per file the checks ask about, from the working tree.
 * @param {string} repoRoot */
function memoFile(repoRoot) {
  /** @type {Map<string, string>} */
  const seen = new Map();
  return (/** @type {string} */ file) => {
    if (!seen.has(file)) seen.set(file, safeRead(join(repoRoot, file)));
    return seen.get(file) ?? "";
  };
}

/** `backlinks` is per record and only F10 asks: spawn on demand, once each.
 * @param {import("./cli.mjs").Launcher} kb */
function memoBacklinks(kb) {
  /** @type {Map<string, any>} */
  const seen = new Map();
  return (/** @type {string} */ conceptId) => {
    if (!seen.has(conceptId))
      seen.set(conceptId, json(kb, ["backlinks", conceptId]));
    return seen.get(conceptId);
  };
}

/** @typedef {ReturnType<typeof buildContext>} Ctx */

/**
 * Every record in the bundle, with the frontmatter fields `load` does not
 * return. `touched` is the whole coverage question: a record the diff did not
 * write or change describes the code before this change, not this change.
 * @param {string} bundle @param {string} repoRoot @param {Set<string>} changed
 * @param {import("./cli.mjs").Launcher} kb
 * @returns {KbRecord[]}
 */
function readRecords(bundle, repoRoot, changed, kb) {
  const loaded = /** @type {any} */ (json(kb, ["load", "--all"]));
  /** @type {Map<string, string>} */
  const standing = new Map();
  for (const record of asArray(loaded?.records)) {
    standing.set(String(/** @type {any} */ (record).conceptId), "current");
  }
  for (const record of asArray(loaded?.superseded)) {
    standing.set(String(/** @type {any} */ (record).conceptId), "superseded");
  }

  /** @type {string[]} */
  let names;
  try {
    names = readdirSync(bundle).filter(
      (name) => name.endsWith(".md") && name !== "INDEX.md",
    );
  } catch {
    return [];
  }
  return names.map((name) => {
    const path = join(bundle, name);
    const { data, body } = parseFrontmatter(safeRead(path));
    const conceptId = name.slice(0, -3);
    const anchors = /** @type {import("./util.mjs").Anchor[]} */ (
      asArray(data.strauss_anchors)
    );
    return {
      conceptId,
      path: relative(repoRoot, path).split("\\").join("/"),
      type: asString(data.type) || conceptId.split(".")[0] || "",
      title: asString(data.title),
      status: asString(data.strauss_status) || "accepted",
      standing: standing.get(conceptId) ?? "current",
      body,
      touched: changed.has(relative(repoRoot, path).split("\\").join("/")),
      anchors,
      links: /** @type {import("./util.mjs").Link[]} */ (
        asArray(data.strauss_links)
      ),
      tags: asArray(data.tags).map(String),
      sources: asArray(data.sources),
      materiality: asString(data.strauss_materiality) || undefined,
      confidence: asString(data.strauss_confidence) || undefined,
      owner: asString(data.strauss_owner) || undefined,
      assumption: data.strauss_assumption === true,
      verify: asArray(data.strauss_verify).map(String),
      verified: asArray(data.verified),
      writtenBy: asString(/** @type {any} */ (data.generated)?.by) || undefined,
      writtenAt: asString(/** @type {any} */ (data.generated)?.at) || undefined,
    };
  });
}

/** @param {string} repoRoot @param {string[]} range @returns {string | null} */
function newestCommitAt(repoRoot, range) {
  const out = git.git(repoRoot, ["log", "-1", "--format=%cI", ...range]);
  return out === null ? null : out.trim() || null;
}

/** @param {string} path */
function safeRead(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/**
 * The coverage unit. `match` names a symbol wherever a record already sits on
 * the hunk; git's function context names the rest. A hunk that resolves to no
 * declaration — an import, a top-level constant — is not a changed symbol,
 * and a file whose hunks all read that way falls back to file level.
 * @param {import("./git.mjs").Hunk[]} hunks @param {any[]} matches
 * @param {Map<string, string>} classes
 * @returns {ChangedSymbol[]}
 */
function changedSymbols(hunks, matches, classes) {
  /** @type {Map<string, ChangedSymbol>} */
  const found = new Map();
  /** @type {Map<string, import("./git.mjs").Hunk[]>} */
  const perFile = new Map();
  for (const hunk of hunks) {
    if (SKIPPED.has(classes.get(hunk.file) ?? "") || !isCodePath(hunk.file))
      continue;
    perFile.set(hunk.file, [...(perFile.get(hunk.file) ?? []), hunk]);
    const named = matchSymbol(matches, hunk) ?? git.contextSymbol(hunk.context);
    if (!named || hunk.newLines === 0) continue;
    const key = `${hunk.file}\u0000${named}`;
    const entry = found.get(key) ?? {
      file: hunk.file,
      symbol: named,
      hunks: [],
    };
    entry.hunks.push(hunk);
    found.set(key, entry);
  }
  for (const [file, fileHunks] of perFile) {
    if (![...found.values()].some((entry) => entry.file === file)) {
      found.set(`${file}\u0000`, { file, symbol: null, hunks: fileHunks });
    }
  }
  return [...found.values()];
}

/** @param {any[]} matches @param {import("./git.mjs").Hunk} hunk */
function matchSymbol(matches, hunk) {
  const hit = matches.find(
    (row) =>
      row?.filePath === hunk.file &&
      row?.precision === "symbol" &&
      Number(row?.hunk?.startLine) <=
        hunk.newStart + Math.max(hunk.newLines - 1, 0) &&
      Number(row?.hunk?.endLine) >= hunk.newStart,
  );
  const symbol = asString(hit?.records?.[0]?.anchor?.symbol);
  return symbol ? (symbol.split(".").pop() ?? symbol) : null;
}

/**
 * The log entries this diff appended — the session's own writes, whether or
 * not the store was reachable when the gate ran.
 * @param {string} repoRoot @param {string[]} range @param {string} bundle
 */
function logAdded(repoRoot, range, bundle) {
  const path = `${relative(repoRoot, bundle).split("\\").join("/")}/log.jsonl`;
  /** @type {any[]} */
  const entries = [];
  for (const line of git.addedLines(repoRoot, range, path)) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // A half-written line is not an event.
    }
  }
  return entries;
}

/** @param {import("./cli.mjs").Launcher} kb */
function stampDigest(kb) {
  const stamped = /** @type {any} */ (json(kb, ["stamp", "--json"]));
  return (
    asString(
      asArray(stamped)[0] && /** @type {any} */ (asArray(stamped)[0]).digest,
    ) || null
  );
}

/**
 * `anchor-resolve` for every record anchored in the diff, and for every record
 * the diff wrote — the second is how D2 asks whether the code a closed risk
 * feared ever moved. It exits non-zero when an anchor is drifted or unresolved
 * and still prints its JSON, so the result is read from stdout, not the status.
 * @param {import("./cli.mjs").Launcher} kb @param {KbRecord[]} records
 * @param {Set<string>} changed @param {boolean} offline
 * @returns {Map<string, any>}
 */
function anchorState(kb, records, changed, offline) {
  /** @type {Map<string, any>} */
  const state = new Map();
  for (const record of records) {
    if (record.anchors.length === 0) continue;
    if (
      !record.touched &&
      !record.anchors.some((anchor) => changed.has(anchor.file))
    ) {
      continue;
    }
    const result = run(kb, [
      "anchor-resolve",
      record.conceptId,
      ...(offline ? ["--offline"] : []),
    ]);
    try {
      state.set(record.conceptId, JSON.parse(result.stdout));
    } catch {
      // No answer is not drift; the check treats it as unknown.
    }
  }
  return state;
}

/**
 * Records this diff wrote or changed that anchor `file` — the only ones that
 * can cover its change.
 * @param {Ctx} ctx @param {string} file
 */
export function coveringRecords(ctx, file) {
  return ctx.touched.filter(
    (record) =>
      record.standing === "current" &&
      record.anchors.some((anchor) => anchor.file === file),
  );
}
