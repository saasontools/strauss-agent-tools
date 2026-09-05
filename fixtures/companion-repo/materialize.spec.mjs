import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DELETED_SUFFIX,
  materialize,
  parseArgv,
  readExpected,
  resolveEntry,
  scenarioNames,
  targetPath,
} from "./materialize.mjs";

const FIXTURE = dirname(fileURLToPath(import.meta.url));
const CLI = join(FIXTURE, "../../packages/strauss-kb/dist/cli-main.js");
const GATE_FAMILIES = new Set(["A", "B", "C", "D", "E", "F"]);
const TEMP_PREFIX = "companion-repo-";

let repo;
before(() => {
  assert.ok(
    existsSync(CLI),
    `strauss-kb is not built — run \`pnpm nx run @saasontools/strauss-kb:build\` (expected ${CLI})`,
  );
  repo = materialize().repo;
});
after(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
});

const git = (args, cwd = repo) =>
  execFileSync("git", args, { cwd, encoding: "utf8" });

/** stdout even when `--strict` exits non-zero on findings. */
function kb(args) {
  try {
    return execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  } catch (error) {
    if (typeof error.stdout === "string" && error.stdout) return error.stdout;
    throw error;
  }
}

const strayTempDirs = () =>
  readdirSync(tmpdir()).filter((name) => name.startsWith(TEMP_PREFIX));

/** Final state of every path a scenario touches: `true` present, `false` gone. */
function finalState(scenario) {
  const state = new Map();
  const commits = JSON.parse(
    readFileSync(join(FIXTURE, "scenarios", scenario, "commits.json"), "utf8"),
  );
  for (const commit of commits) {
    for (const file of commit.files) {
      state.set(
        targetPath(file),
        !resolveEntry(file).to.endsWith(DELETED_SUFFIX),
      );
    }
  }
  return state;
}

test("main plus one branch per scenario", () => {
  const branches = git(["branch", "--format=%(refname:short)"])
    .split("\n")
    .filter(Boolean)
    .sort();
  assert.deepEqual(branches, ["main", ...scenarioNames()].sort());
});

test("a subset build keeps the hashes of a whole one", () => {
  const subset = materialize({ scenarios: ["blocking-risk"] });
  try {
    assert.equal(
      git(["rev-parse", "blocking-risk"], subset.repo),
      git(["rev-parse", "blocking-risk"]),
    );
  } finally {
    rmSync(subset.repo, { recursive: true, force: true });
  }
});

test("a hostile global git config changes nothing", () => {
  const home = mkdtempSync(join(tmpdir(), "companion-home-"));
  const hooks = join(home, "hooks");
  mkdirSync(hooks);
  writeFileSync(join(hooks, "pre-commit"), "#!/bin/sh\nexit 1\n");
  chmodSync(join(hooks, "pre-commit"), 0o755);
  writeFileSync(join(home, "ignore"), "log.jsonl\n");
  writeFileSync(
    join(home, ".gitconfig"),
    `[core]\n\thooksPath = ${hooks}\n\texcludesFile = ${join(home, "ignore")}\n\tautocrlf = true\n`,
  );

  const saved = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
  };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  let hostile;
  try {
    hostile = materialize({ scenarios: ["blocking-risk"] });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  try {
    const files = git(["ls-tree", "-r", "--name-only", "main"], hostile.repo)
      .split("\n")
      .filter(Boolean);
    assert.equal(files.length, 17, "the excludesFile must not drop log.jsonl");
    assert.ok(files.includes(".strauss/kb/log.jsonl"));
    assert.equal(
      git(["rev-parse", "blocking-risk"], hostile.repo),
      git(["rev-parse", "blocking-risk"]),
    );
  } finally {
    rmSync(hostile.repo, { recursive: true, force: true });
  }
});

test("a directory that is not a fixture build is refused", () => {
  const out = mkdtempSync(join(tmpdir(), "companion-out-"));
  writeFileSync(join(out, "important.txt"), "keep me\n");
  try {
    assert.throws(() => materialize({ out, scenarios: [] }), /pass --force/);
    assert.equal(readFileSync(join(out, "important.txt"), "utf8"), "keep me\n");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("a failed build leaves no temp directory behind", () => {
  const before = strayTempDirs();
  assert.throws(
    () => materialize({ scenarios: ["no-such-scenario"] }),
    /no scenario named no-such-scenario/,
  );
  assert.deepEqual(strayTempDirs(), before);
});

test("the CLI takes --scenarios and refuses anything else", () => {
  assert.deepEqual(parseArgv(["--scenarios", "docs-only,blocking-risk"]), {
    scenarios: ["docs-only", "blocking-risk"],
  });
  assert.deepEqual(parseArgv(["--out", "/tmp/x", "--force"]), {
    out: "/tmp/x",
    force: true,
  });
  assert.throws(
    () => parseArgv(["--scenario", "docs-only"]),
    /unknown argument/,
  );
  assert.throws(() => parseArgv(["--out"]), /--out needs a value/);
});

for (const scenario of scenarioNames()) {
  test(`${scenario}: head carries its files and the base validates`, () => {
    git(["checkout", "--quiet", "--end-of-options", scenario]);

    for (const [target, present] of finalState(scenario)) {
      assert.equal(
        existsSync(join(repo, target)),
        present,
        `${scenario}: ${target} is on the wrong side of its commits`,
      );
      // A record deleted at HEAD must really have existed earlier, or the
      // scenario is testing an absence that was never a presence.
      if (!present) {
        assert.ok(
          git(["log", "--diff-filter=D", "--format=%H", "--", target]).trim(),
          `${scenario}: ${target} was never added before being deleted`,
        );
      }
    }

    const problems = JSON.parse(
      kb(["--bundle", join(repo, ".strauss/kb"), "validate"]),
    );
    assert.deepEqual(
      problems.filter((problem) => problem.severity === "error"),
      [],
      `${scenario}: kb_validate reported errors`,
    );

    const expected = readExpected(scenario);
    assert.ok(
      ["auto", "agent-review-then-auto", "human"].includes(expected.route),
      `${scenario}: unknown route ${expected.route}`,
    );

    // The classifier map is the three-dot diff against main, nothing wider.
    const changed = new Set(
      git(["diff", "--name-only", `main...${scenario}`])
        .split("\n")
        .filter(Boolean),
    );
    for (const path of Object.keys(expected.classifier)) {
      assert.ok(
        changed.has(path),
        `${scenario}: classifier names ${path}, which main...${scenario} does not change`,
      );
    }
    for (const family of expected.gateFamilies) {
      assert.ok(
        GATE_FAMILIES.has(family),
        `${scenario}: ${family} is not one of A–F`,
      );
    }

    // doctorArgs pin the age thresholds, so the README's findings table stays
    // true however long after 2026-09-01 this runs.
    const doctor = JSON.parse(
      kb([
        "--bundle",
        join(repo, ".strauss/kb"),
        "doctor",
        "--strict",
        "--repo-root",
        repo,
        ...expected.doctorArgs,
        "--json",
      ]),
    );
    assert.equal(
      doctor.counts.unverified,
      0,
      `${scenario}: doctorArgs are unpinned`,
    );
    assert.equal(
      doctor.counts.aging,
      0,
      `${scenario}: doctorArgs are unpinned`,
    );
  });
}
