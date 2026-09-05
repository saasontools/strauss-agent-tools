// @ts-check
/** Everything the gate reads from git: the diff, its hunks, its digest. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { childEnv } from "./util.mjs";

const TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

/** Off on every diff: both run a command the repository configured. */
const DIFF_SAFE = ["--no-color", "--no-ext-diff", "--no-textconv"];

/**
 * @typedef {{ path: string, oldPath?: string, status: string }} ChangedFile
 * @typedef {{ file: string, oldStart: number, oldLines: number,
 *   newStart: number, newLines: number, context: string,
 *   added: string[], removed: string[] }} Hunk
 */

/**
 * Every git read the gate makes. The `GIT_*` overrides are stripped from the
 * child, and every positional that derives from bundle or config data goes
 * after `--end-of-options` at the call sites below.
 * @param {string} cwd @param {string[]} args @returns {string | null}
 */
export function git(cwd, args) {
  const result = spawnSync("git", ["--no-pager", ...args], {
    cwd,
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
    env: childEnv(),
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout ?? "";
}

/** @param {string} text */
export function digest(text) {
  return createHash("sha256").update(text).digest("hex");
}

/** @param {string} cwd */
export function head(cwd) {
  return (git(cwd, ["rev-parse", "HEAD"]) ?? "").trim() || null;
}

/**
 * The range the gate reads. A `head` of null means "base against the working
 * tree", which is the Stop-hook case: committed work plus what is still
 * uncommitted, in one diff.
 * @param {string | null} base @param {string | null} head
 */
export function rangeArgs(base, head) {
  if (!base) return ["HEAD"];
  return head ? [`${base}..${head}`] : [base];
}

/**
 * The range `match --git` takes. It refuses a bare rev, so the hook's "base
 * against the working tree" is spelled `<base>..HEAD` there; with no base
 * there is no range to ask about.
 * @param {string | null} base @param {string | null} head @returns {string[]}
 */
export function matchRange(base, head) {
  return base ? [`${base}..${head ?? "HEAD"}`] : [];
}

/** @param {string} cwd @param {string[]} range @returns {ChangedFile[]} */
export function changedFiles(cwd, range) {
  const out = git(cwd, [
    "diff",
    ...DIFF_SAFE,
    "--name-status",
    "-M",
    "--end-of-options",
    ...range,
    "--",
  ]);
  if (out === null) return [];
  /** @type {ChangedFile[]} */
  const files = [];
  for (const line of out.split("\n").filter(Boolean)) {
    const parts = line.split("\t");
    const status = (parts[0] ?? "").trim();
    if (status.startsWith("R") && parts[2]) {
      files.push({ path: parts[2], oldPath: parts[1], status: "R" });
    } else if (parts[1]) {
      files.push({ path: parts[1], status: status.charAt(0) });
    }
  }
  return files;
}

/** @param {string} cwd @param {string[]} range @returns {string} */
export function diffText(cwd, range) {
  return (
    git(cwd, [
      "diff",
      ...DIFF_SAFE,
      "-M",
      "--end-of-options",
      ...range,
      "--",
    ]) ?? ""
  );
}

/**
 * `-U0` hunks, each with its git function context and its own added and
 * removed lines. The context line is where a changed symbol's name comes from
 * when `match` has no record on that hunk to name it.
 * @param {string} cwd @param {string[]} range @returns {Hunk[]}
 */
export function hunks(cwd, range) {
  const out = git(cwd, [
    "diff",
    ...DIFF_SAFE,
    "-U0",
    "-M",
    "--end-of-options",
    ...range,
    "--",
  ]);
  if (out === null) return [];
  /** @type {Hunk[]} */
  const all = [];
  let file = "";
  /** @type {Hunk | null} */
  let current = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("+++ ")) {
      file = line.slice(4).replace(/^b\//, "");
      current = null;
    } else if (line.startsWith("@@")) {
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/.exec(
        line,
      );
      if (!match || file === "/dev/null") continue;
      current = {
        file,
        oldStart: Number(match[1]),
        oldLines: match[2] === undefined ? 1 : Number(match[2]),
        newStart: Number(match[3]),
        newLines: match[4] === undefined ? 1 : Number(match[4]),
        context: match[5] ?? "",
        added: [],
        removed: [],
      };
      all.push(current);
    } else if (current && line.startsWith("+")) {
      current.added.push(line.slice(1));
    } else if (current && line.startsWith("-")) {
      current.removed.push(line.slice(1));
    }
  }
  return all;
}

/**
 * The declared name in a hunk's function context — a class, function,
 * interface, type or method. A top-level `const` is not one: git reports the
 * nearest preceding declaration, which for a file-scope hunk names something
 * the hunk did not touch.
 * @param {string} context
 */
export function contextSymbol(context) {
  const match =
    /\b(?:class|interface|enum|struct|trait|impl)\s+([A-Za-z_$][\w$]*)/.exec(
      context,
    ) ??
    /\b(?:function|func|def|fn)\s+([A-Za-z_$][\w$]*)/.exec(context) ??
    /^\s*(?:public|private|protected|static|readonly|async|export|abstract|\s)*([A-Za-z_$][\w$]*)\s*\(/.exec(
      context,
    );
  const name = match?.[1];
  return name && !RESERVED.has(name) ? name : null;
}

const RESERVED = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "return",
  "new",
  "typeof",
  "await",
  "constructor",
]);

/** Commits in the range, oldest first, each with the paths it changed.
 * @param {string} cwd @param {string[]} range
 * @returns {{ sha: string, paths: Set<string> }[]} */
export function commits(cwd, range) {
  const out = git(cwd, [
    "log",
    "--reverse",
    "--format=%x00%H",
    "--name-only",
    "--end-of-options",
    ...range,
  ]);
  if (out === null) return [];
  return out
    .split("\0")
    .filter((block) => block.trim())
    .map((block) => {
      const lines = block.split("\n").filter(Boolean);
      return {
        sha: lines[0] ?? "",
        paths: new Set(lines.slice(1)),
      };
    });
}

/** Added lines of one path across the range, `+` stripped.
 * @param {string} cwd @param {string[]} range @param {string} path */
export function addedLines(cwd, range, path) {
  const out = git(cwd, [
    "diff",
    ...DIFF_SAFE,
    "-U0",
    "--end-of-options",
    ...range,
    "--",
    path,
  ]);
  if (out === null) return [];
  return out
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
}

/**
 * Paths under `dir` the range diff cannot see: never added, or changed in the
 * working tree and not yet committed. A record written this turn is one or the
 * other, and a record the gate cannot see reads as no coverage at all.
 * @param {string} cwd @param {string} dir @returns {string[]}
 */
export function uncommittedPaths(cwd, dir) {
  const lines = [
    git(cwd, ["ls-files", "--others", "--exclude-standard", "--", dir]),
    git(cwd, ["diff", ...DIFF_SAFE, "--name-only", "--", dir]),
  ];
  return [...new Set(lines.flatMap((out) => (out ?? "").split("\n")))].filter(
    Boolean,
  );
}
