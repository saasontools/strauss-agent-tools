#!/usr/bin/env node
// Builds the companion fixture into a real git repository: `main` from base/,
// one branch per scenario replaying its commits.json. Deterministic identity
// and dates, so the same tree always yields the same hashes.
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { devNull, tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE = dirname(fileURLToPath(import.meta.url));
const BASE = join(FIXTURE, "base");
const SCENARIOS = join(FIXTURE, "scenarios");

/** Marks a deletion: `head/<path>.deleted` removes `<path>` in that commit. */
export const DELETED_SUFFIX = ".deleted";

// The builder never reads the machine's git config: a global hooksPath,
// excludesFile or autocrlf would change the tree or fail the commit, and the
// hashes are the fixture's contract.
const ENV = {
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_SYSTEM: devNull,
  GIT_AUTHOR_NAME: "Companion Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Companion Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};
const CONFIG = [
  "-c",
  "core.hooksPath=",
  "-c",
  `core.excludesFile=${devNull}`,
  "-c",
  "core.autocrlf=false",
  "-c",
  "commit.gpgsign=false",
  "-c",
  "init.defaultBranch=main",
];

const EPOCH = 1_756_717_200; // 2026-09-01T09:00:00Z, matching the frozen base.
const STEP_SECONDS = 3600;

function git(cwd, args, extraEnv = {}) {
  return execFileSync("git", [...CONFIG, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...ENV, ...extraEnv },
  });
}

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, base, out);
    else out.push(relative(base, full).split(sep).join("/"));
  }
  return out;
}

export function scenarioNames() {
  return readdirSync(SCENARIOS)
    .filter((name) => statSync(join(SCENARIOS, name)).isDirectory())
    .sort();
}

export function readExpected(scenario) {
  return JSON.parse(
    readFileSync(join(SCENARIOS, scenario, "expected.json"), "utf8"),
  );
}

/**
 * One entry of a commit's `files`: either a path under `head/` used as-is, or
 * `{ from, to }` when a file changes twice and each state needs its own name
 * in `head/`. Both names agree on whether the entry is a deletion.
 */
export function resolveEntry(entry) {
  const pair =
    typeof entry === "string" ? { from: entry, to: entry } : (entry ?? {});
  if (typeof pair.from !== "string" || typeof pair.to !== "string") {
    throw new Error(
      `companion-repo: a files entry is a path or { from, to }, not ${JSON.stringify(entry)}`,
    );
  }
  if (pair.from.endsWith(DELETED_SUFFIX) !== pair.to.endsWith(DELETED_SUFFIX)) {
    throw new Error(
      `companion-repo: ${pair.from} → ${pair.to} makes only one side a deletion`,
    );
  }
  return { from: pair.from, to: pair.to };
}

/** The repository path an entry lands on, with any `.deleted` suffix removed. */
export function targetPath(entry) {
  const { to } = resolveEntry(entry);
  return to.endsWith(DELETED_SUFFIX) ? to.slice(0, -DELETED_SUFFIX.length) : to;
}

function applyFile(headDir, repo, entry) {
  const { from, to } = resolveEntry(entry);
  const target = targetPath(entry);
  if (to.endsWith(DELETED_SUFFIX)) {
    rmSync(join(repo, target), { force: true });
    return target;
  }
  const source = join(headDir, from);
  if (!existsSync(source)) {
    throw new Error(`companion-repo: ${relative(FIXTURE, source)} is missing`);
  }
  const destination = join(repo, target);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(source));
  return target;
}

function commit(repo, message, stamp) {
  const date = `${stamp} +0000`;
  git(repo, ["add", "--all", "--end-of-options", "."]);
  git(repo, ["commit", "--quiet", "-m", message], {
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
  });
}

/**
 * Reads a scenario and checks every `head/` file is claimed by some commit, or
 * it silently ships a file no branch contains. Runs before the first commit,
 * so a broken scenario costs no repository.
 */
function readScenario(name) {
  const dir = join(SCENARIOS, name);
  if (!existsSync(join(dir, "commits.json"))) {
    throw new Error(`companion-repo: no scenario named ${name}`);
  }
  const commits = JSON.parse(readFileSync(join(dir, "commits.json"), "utf8"));
  const claimed = new Set(
    commits
      .flatMap((entry) => entry.files)
      .map((file) => resolveEntry(file).from),
  );
  const headDir = join(dir, "head");
  if (existsSync(headDir)) {
    for (const file of walk(headDir)) {
      if (!claimed.has(file)) {
        throw new Error(
          `companion-repo: ${name}/head/${file} is in no commit of commits.json`,
        );
      }
    }
  }
  return { name, headDir, commits };
}

/**
 * `out` is emptied, so it must be a directory this is allowed to destroy:
 * absent, empty, or a previous build of this fixture.
 */
function assertErasable(dir, force) {
  if (force || !existsSync(dir)) return;
  const entries = statSync(dir).isDirectory() ? readdirSync(dir) : null;
  if (entries?.length === 0) return;
  if (entries?.includes(".git") && entries.includes(".strauss")) return;
  throw new Error(
    `companion-repo: ${dir} is neither empty nor a previous fixture build; pass --force to erase it`,
  );
}

/**
 * Builds the repository. `out` defaults to a fresh temp directory; a named one
 * is emptied first, subject to `force`. `scenarios` limits which branches are
 * built without moving any commit date.
 */
export function materialize({ out, scenarios, force = false } = {}) {
  const all = scenarioNames();
  const names = (scenarios ?? all).slice().sort();
  const loaded = names.map(readScenario);

  const repo = out
    ? resolve(out)
    : mkdtempSync(join(tmpdir(), "companion-repo-"));
  if (out) assertErasable(repo, force);

  try {
    rmSync(repo, { recursive: true, force: true });
    mkdirSync(repo, { recursive: true });

    git(repo, ["init", "--quiet", "--initial-branch", "main"]);
    cpSync(BASE, repo, { recursive: true });
    commit(repo, "chore: companion fixture base", EPOCH);

    const branches = [];
    for (const scenario of loaded) {
      git(repo, ["checkout", "--quiet", "-B", scenario.name, "main"]);
      // Dates key off the scenario's place in the full list, so a subset build
      // produces the same hashes as a whole one.
      const start =
        EPOCH + (all.indexOf(scenario.name) + 1) * 100 * STEP_SECONDS;
      for (const [step, entry] of scenario.commits.entries()) {
        for (const file of entry.files) applyFile(scenario.headDir, repo, file);
        commit(repo, entry.message, start + step * STEP_SECONDS);
      }
      branches.push({
        branch: scenario.name,
        commits: scenario.commits.length,
      });
    }
    git(repo, ["checkout", "--quiet", "main"]);
    return { repo, branches };
  } catch (error) {
    if (!out) rmSync(repo, { recursive: true, force: true });
    throw error;
  }
}

/** `--out <dir>`, `--scenarios a,b`, `--force`; anything else is a typo. */
export function parseArgv(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--force") {
      options.force = true;
      continue;
    }
    if (flag !== "--out" && flag !== "--scenarios") {
      throw new Error(`companion-repo: unknown argument ${flag}`);
    }
    const value = argv[(index += 1)];
    if (value === undefined) {
      throw new Error(`companion-repo: ${flag} needs a value`);
    }
    if (flag === "--out") options.out = value;
    else options.scenarios = value.split(",").filter(Boolean);
  }
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(
    JSON.stringify(materialize(parseArgv(process.argv.slice(2))), null, 2),
  );
}
