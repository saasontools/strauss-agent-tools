// @ts-check
/**
 * Every companion-repo scenario, against the `route` its `expected.json` pins.
 * A miss here is one of two things: the rules changed, or the golden is wrong.
 * Read the branch's `notes` before touching either.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..", "..", "..");
const SCRIPT = join(HERE, "merge-policy.mjs");
const FIXTURE = join(ROOT, "fixtures", "companion-repo", "materialize.mjs");
const SCENARIOS = join(ROOT, "fixtures", "companion-repo", "scenarios");
const KB_CLI = join(ROOT, "packages", "strauss-kb", "dist", "cli-main.js");

/** @type {string[]} */
const built = [];
after(() => {
  for (const dir of built) rmSync(dir, { recursive: true, force: true });
});

/** A fresh repository per scenario: the run stamps anchors that carry no hash.
 * @param {string} scenario */
function materialize(scenario) {
  const out = mkdtempSync(join(tmpdir(), `merge-policy-${scenario}-`));
  built.push(out);
  execFileSync(
    process.execPath,
    [FIXTURE, "--out", out, "--scenarios", scenario, "--force"],
    { encoding: "utf8" },
  );
  execFileSync(
    "git",
    ["-C", out, "-c", "core.autocrlf=false", "checkout", "--quiet", scenario],
    {
      encoding: "utf8",
    },
  );
  return out;
}

/** @param {string} repo @param {string[]} args
 * @returns {{ status: number, model: any, stderr: string }} */
function route(repo, args) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      cwd: repo,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, STRAUSS_KB_BIN: KB_CLI },
    });
    return { status: 0, model: JSON.parse(stdout), stderr: "" };
  } catch (error) {
    const failure = /** @type {any} */ (error);
    return {
      status: failure.status ?? 1,
      model: failure.stdout ? JSON.parse(failure.stdout) : null,
      stderr: String(failure.stderr ?? ""),
    };
  }
}

/**
 * A repository the fixture does not cover: a base policy that names an owner,
 * and a branch whose one source file routes human. The enforce contract needs
 * both, and `owners` is not part of the companion base's placeholder policy.
 * @returns {{ repo: string, sha: string }}
 */
function ownedRepo() {
  const repo = mkdtempSync(join(tmpdir(), "merge-policy-owned-"));
  built.push(repo);
  /** @param {string[]} args */
  const run = (args) =>
    execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "fixture",
        GIT_AUTHOR_EMAIL: "fixture@example.invalid",
        GIT_COMMITTER_NAME: "fixture",
        GIT_COMMITTER_EMAIL: "fixture@example.invalid",
      },
    });
  run(["init", "--quiet", "--initial-branch", "main"]);
  mkdirSync(join(repo, ".strauss"), { recursive: true });
  writeFileSync(
    join(repo, ".strauss", "merge-policy.json"),
    `${JSON.stringify({ version: 1, owners: ["dana"] }, null, 2)}\n`,
  );
  writeFileSync(join(repo, "README.md"), "base\n");
  run(["add", "-A"]);
  run(["commit", "--quiet", "-m", "base"]);
  run(["checkout", "--quiet", "-b", "topic"]);
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  run(["add", "-A"]);
  run(["commit", "--quiet", "-m", "feat: a"]);
  return { repo, sha: run(["rev-parse", "topic"]).trim() };
}

/** @param {string} scenario */
function golden(scenario) {
  return JSON.parse(
    readFileSync(join(SCENARIOS, scenario, "expected.json"), "utf8"),
  );
}

const EXPECTED_RULE = {
  "docs-only": "auto-mechanical",
  "generated-block": "auto-mechanical",
  "silent-code-change": "uncovered-change",
  "blocking-risk": "open-obligation",
  "author-resolved-risk": "unearned-resolution",
  // The record is written and deleted inside this range, so the base tree
  // never held it; A1 on the uncovered `pay.ts` is what routes it human.
  "deleted-record": "uncovered-change",
  "policy-file-change": "policy-changed",
  "excluded-path-crosses": "uncovered-change",
  "drift-after-commit": "gate-block",
  "review-thread-decision": "default-human",
  "fabricated-decision": "gate-block",
};

for (const [scenario, rule] of Object.entries(EXPECTED_RULE)) {
  test(`${scenario} routes the way its expected.json says`, () => {
    const repo = materialize(scenario);
    const { model } = route(repo, [
      "--range",
      `main..${scenario}`,
      "--repo-root",
      repo,
      "--json",
    ]);
    assert.equal(
      model.route,
      golden(scenario).route,
      `${scenario}: ${model.reason}`,
    );
    assert.equal(model.rule, rule, `${scenario}: ${model.reason}`);
    // Nothing is written into the base: the record body comes back instead.
    assert.equal(model.record.type, "decision");
    assert.match(model.record.conceptId, /^decision\.merge-/);
  });
}

test("without --enforce the exit code is 0 whatever the route", () => {
  const repo = materialize("blocking-risk");
  const { status, model } = route(repo, [
    "--range",
    "main..blocking-risk",
    "--repo-root",
    repo,
    "--json",
  ]);
  assert.equal(model.route, "human");
  assert.equal(status, 0);
  assert.equal(model.enforce, null);
});

test("--enforce fails a human route with no owner approval, and passes one with it", () => {
  const { repo, sha } = ownedRepo();
  const bare = route(repo, [
    "--range",
    "main..topic",
    "--repo-root",
    repo,
    "--json",
    "--enforce",
  ]);
  assert.equal(bare.model.route, "human");
  assert.equal(bare.status, 1);
  assert.equal(bare.model.enforce.exit, 1);

  const approvals = join(repo, "approvals.json");
  writeFileSync(
    approvals,
    JSON.stringify([{ user: "dana", state: "APPROVED", commit_id: sha }]),
  );
  const approved = route(repo, [
    "--range",
    "main..topic",
    "--repo-root",
    repo,
    "--approvals",
    approvals,
    "--json",
    "--enforce",
  ]);
  assert.equal(approved.model.route, "human");
  assert.equal(approved.status, 0);
  assert.deepEqual(approved.model.enforce.approvedBy, ["dana"]);
});

test("--enforce reads approval from the reviews dump, never from a kb verify", () => {
  const { repo, sha } = ownedRepo();
  const approvals = join(repo, "approvals.json");
  // A stranger, a stale sha, and a comment: none of them is an approval.
  writeFileSync(
    approvals,
    JSON.stringify([
      { user: "mallory", state: "APPROVED", commit_id: sha },
      { user: "dana", state: "APPROVED", commit_id: "0".repeat(40) },
      { user: "dana", state: "COMMENTED", commit_id: sha },
    ]),
  );
  const answer = route(repo, [
    "--range",
    "main..topic",
    "--repo-root",
    repo,
    "--approvals",
    approvals,
    "--json",
    "--enforce",
  ]);
  assert.equal(answer.status, 1);
  assert.deepEqual(answer.model.enforce.approvedBy, []);
});

test("--enforce passes an auto route", () => {
  const repo = materialize("docs-only");
  const { status, model } = route(repo, [
    "--range",
    "main..docs-only",
    "--repo-root",
    repo,
    "--json",
    "--enforce",
  ]);
  assert.equal(model.route, "auto");
  assert.equal(status, 0);
});

test("a policy weakened on the head branch does not apply to its own range", () => {
  const repo = materialize("policy-file-change");
  const { model } = route(repo, [
    "--range",
    "main..policy-file-change",
    "--repo-root",
    repo,
    "--json",
  ]);
  // The branch adds `docs/**` to the exclusions. The route reads main's copy,
  // whose hash is the one reported.
  const base = execFileSync(
    "git",
    ["-C", repo, "show", "main:.strauss/merge-policy.yaml"],
    { encoding: "utf8" },
  );
  assert.ok(!base.includes("docs/**"));
  assert.equal(model.policy.path, ".strauss/merge-policy.yaml");
  assert.equal(model.route, "human");
  assert.equal(model.rule, "policy-changed");
});

test("a bad flag exits 2, never 1 — a usage error is not a human route", () => {
  const { repo } = ownedRepo();
  const base = ["--range", "main..topic", "--repo-root", repo, "--json"];
  /** @param {string[]} extra */
  const bad = (extra) => route(repo, [...base, ...extra]);

  for (const [why, extra] of /** @type {[string, string[]][]} */ ([
    ["a --pr that is not a name", ["--pr", "../../etc/passwd"]],
    ["a --pr that does not start with a name character", ["--pr", ".hidden"]],
    ["an --approvals path that is not there", ["--approvals", "nope.json"]],
    ["a --gate with no findings", ["--gate", '{"blocks":[]}']],
    ["a --reviewer that is an array", ["--reviewer", "[]"]],
    ["an --approvals that is an object", ["--approvals", "{}"]],
  ])) {
    assert.equal(bad(extra).status, 2, why);
  }

  // The same flags, well formed.
  const good = route(repo, [
    ...base,
    "--pr",
    "SAA-741",
    "--gate",
    '{"findings":[]}',
  ]);
  assert.equal(good.status, 0);
  assert.equal(good.model.record.conceptId, "decision.merge-SAA-741");
  assert.ok(
    good.model.notChecked.includes("gate: supplied by --gate, not run"),
    good.model.notChecked.join(" | "),
  );
});

test("a row above the gate decides without spawning it", () => {
  const repo = materialize("policy-file-change");
  const { model } = route(repo, [
    "--range",
    "main..policy-file-change",
    "--repo-root",
    repo,
    "--json",
  ]);
  assert.equal(model.rule, "policy-changed");
  assert.deepEqual(model.gate, { blocks: [], warns: [] });
  assert.ok(
    model.notChecked.includes("gate: a row above it decided this range"),
    model.notChecked.join(" | "),
  );
});
