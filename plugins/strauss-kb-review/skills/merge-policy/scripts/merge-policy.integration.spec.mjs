// @ts-check
/**
 * Every companion-repo scenario, against the `route` its `expected.json` pins.
 * A miss here is one of two things: the rules changed, or the golden is wrong.
 * Read the branch's `notes` before touching either.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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

/** @type {string | null} */
let telemetry = null;

/** One sink for the whole file, torn down with everything else. */
function telemetryDir() {
  if (!telemetry) {
    telemetry = mkdtempSync(join(tmpdir(), "merge-policy-telemetry-"));
    built.push(telemetry);
  }
  return telemetry;
}

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

/** @param {string} repo @param {string[]} args @param {NodeJS.ProcessEnv} [extra]
 * @returns {{ status: number, model: any, stderr: string }} */
function route(repo, args, extra) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      cwd: repo,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      // `--enforce` emits one telemetry event, which must never reach $HOME.
      env: {
        ...process.env,
        STRAUSS_KB_BIN: KB_CLI,
        STRAUSS_TELEMETRY_DIR: telemetryDir(),
        ...extra,
      },
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
 * `over` moves the policy or the branch's one file, for the runs that need a
 * different route or a different `enabled`.
 * @param {{ policy?: Record<string, unknown>, change?: [string, string] }} [over]
 * @returns {{ repo: string, sha: string }}
 */
function ownedRepo(over = {}) {
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
    `${JSON.stringify({ version: 1, owners: ["dana"], ...over.policy }, null, 2)}\n`,
  );
  writeFileSync(join(repo, "README.md"), "base\n");
  run(["add", "-A"]);
  run(["commit", "--quiet", "-m", "base"]);
  run(["checkout", "--quiet", "-b", "topic"]);
  const [path, text] = over.change ?? ["src/a.ts", "export const a = 1;\n"];
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
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
  // whose merged hash is the one reported.
  const base = execFileSync(
    "git",
    ["-C", repo, "show", "main:.strauss/merge-policy.json"],
    { encoding: "utf8" },
  );
  assert.ok(!base.includes("docs/**"));
  assert.equal(model.policy.path, ".strauss/merge-policy.json");
  assert.deepEqual(model.policy.layers, ["repo"]);
  assert.equal(model.route, "human");
  assert.equal(model.rule, "policy-changed");
});

test("an unknown value routes human, with the error named", () => {
  const { repo } = ownedRepo({
    policy: { types: { decision: "sometimes" } },
  });
  const { model } = route(repo, [
    "--range",
    "main..topic",
    "--repo-root",
    repo,
    "--json",
  ]);
  assert.equal(model.route, "human");
  assert.equal(model.rule, "policy-disabled");
  assert.match(
    model.reason,
    /types\.decision: sometimes is not auto\|off\|human/,
  );
});

test("the org defaults layer is read from the env, and only ever escalates", () => {
  const { repo } = ownedRepo();
  const defaults = join(repo, "org-defaults.json");
  writeFileSync(defaults, JSON.stringify({ auto: { classes: ["docs"] } }));
  const { model } = route(
    repo,
    ["--range", "main..topic", "--repo-root", repo, "--json"],
    { STRAUSS_MERGE_POLICY_DEFAULTS: defaults },
  );
  assert.deepEqual(model.policy.layers, ["defaults", "repo"]);
  // The repo policy names no `auto` block, so the defaults' allowlist stands
  // and this range's one source file is still loud.
  assert.equal(model.route, "human");
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
  // The subject is slugified: a concept-id slug is lower kebab.
  assert.equal(good.model.record.conceptId, "decision.merge-saa-741");
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

/** The `decision.merge-*` records a bundle holds, by status.
 * @param {string} repo */
function mergeRecords(repo) {
  const bundle = join(repo, ".strauss", "kb");
  return readdirSync(bundle)
    .filter(
      (name) => name.startsWith("decision.merge-") && name.endsWith(".md"),
    )
    .map((name) => ({
      id: name.slice(0, -3),
      superseded: readFileSync(join(bundle, name), "utf8").includes(
        "strauss_status: superseded",
      ),
    }));
}

test("--write-record lands one record per run, each superseding the last", () => {
  const repo = materialize("docs-only");
  const args = [
    "--range",
    "main..docs-only",
    "--repo-root",
    repo,
    "--json",
    "--enforce",
    "--write-record",
    "--pr",
    "7",
    "--pr-url",
    "https://github.com/acme/app/pull/7",
  ];

  const first = route(repo, args);
  assert.equal(first.model.route, "auto");
  assert.equal(first.model.wrote.written, true, first.model.wrote?.why);
  assert.equal(first.model.wrote.conceptId, "decision.merge-7");

  // `--pr-url` rides into the record as a source, so the landed file cites it.
  const body = readFileSync(
    join(repo, ".strauss", "kb", "decision.merge-7.md"),
    "utf8",
  );
  assert.match(body, /\[\^pr\]: Pull request/);
  assert.match(body, /https:\/\/github\.com\/acme\/app\/pull\/7/);

  const second = route(repo, args);
  assert.equal(second.model.wrote.written, true, second.model.wrote?.why);
  assert.equal(second.model.wrote.conceptId, "decision.merge-7-2");
  assert.deepEqual(second.model.wrote.supersededIds, ["decision.merge-7"]);

  const written = mergeRecords(repo);
  assert.equal(written.length, 2);
  assert.deepEqual(
    written.filter((row) => !row.superseded).map((row) => row.id),
    ["decision.merge-7-2"],
  );
  assert.deepEqual(
    written.filter((row) => row.superseded).map((row) => row.id),
    ["decision.merge-7"],
  );
});

test("another subject's record is never taken as this subject's ordinal", () => {
  const repo = materialize("docs-only");
  /** @param {string} pr */
  const write = (pr) =>
    route(repo, [
      "--range",
      "main..docs-only",
      "--repo-root",
      repo,
      "--json",
      "--enforce",
      "--write-record",
      "--pr",
      pr,
    ]);

  assert.equal(write("7").model.wrote.conceptId, "decision.merge-7");
  // PR `7-2` owns `decision.merge-7-2`. It is not PR `7`'s second write, so
  // PR `7`'s rerun steps over the taken id and leaves it alone.
  assert.equal(write("7-2").model.wrote.conceptId, "decision.merge-7-2");

  const again = write("7");
  assert.equal(again.model.wrote.written, true, again.model.wrote?.why);
  assert.equal(again.model.wrote.conceptId, "decision.merge-7-3");
  assert.deepEqual(again.model.wrote.supersededIds, ["decision.merge-7"]);

  assert.deepEqual(
    mergeRecords(repo)
      .filter((row) => !row.superseded)
      .map((row) => row.id)
      .sort(),
    ["decision.merge-7-2", "decision.merge-7-3"],
  );
});

test("a human route writes nothing, and neither does a dry run", () => {
  const repo = materialize("blocking-risk");
  const base = [
    "--range",
    "main..blocking-risk",
    "--repo-root",
    repo,
    "--json",
  ];

  const enforced = route(repo, [...base, "--enforce", "--write-record"]);
  assert.equal(enforced.model.route, "human");
  assert.equal(enforced.model.wrote.written, false);
  assert.match(enforced.model.wrote.why, /route is human/);
  assert.deepEqual(mergeRecords(repo), []);

  // The body still comes back, so a caller can show what would have landed.
  assert.match(enforced.model.record.conceptId, /^decision\.merge-/);
  assert.match(
    enforced.model.record.alternative,
    /^auto, and agent-review-then-auto/,
  );

  const docs = materialize("docs-only");
  const dry = route(docs, [
    "--range",
    "main..docs-only",
    "--repo-root",
    docs,
    "--json",
    "--write-record",
  ]);
  assert.equal(dry.model.route, "auto");
  assert.equal(dry.model.wrote.written, false);
  assert.match(dry.model.wrote.why, /needs --enforce/);
  assert.deepEqual(mergeRecords(docs), []);
});

test("--report-out writes the sticky block, and --summary appends the same one", () => {
  const repo = materialize("docs-only");
  const out = join(repo, "report.md");
  const summary = join(repo, "step-summary.md");
  const { model } = route(
    repo,
    [
      "--range",
      "main..docs-only",
      "--repo-root",
      repo,
      "--json",
      "--enforce",
      "--report-out",
      out,
      "--summary",
      "--pr-url",
      "https://github.com/acme/app/pull/7",
    ],
    { GITHUB_STEP_SUMMARY: summary },
  );

  const block = readFileSync(out, "utf8");
  assert.ok(block.startsWith("<!-- strauss-kb merge-policy -->\n"), block);
  assert.match(block, /\| route \| `auto` via `auto-mechanical` \|/);
  assert.match(block, new RegExp(`\\| head \\| \`${model.headSha}\` \\|`));
  assert.ok(block.trimEnd().split("\n").length <= 40, block);

  // Every kb child appends its own step-summary lines, before this block and
  // after it, so the block is one section of the file rather than all of it.
  assert.ok(existsSync(summary));
  assert.ok(readFileSync(summary, "utf8").includes(block), "summary differs");
});

/** This step's own events in a sink every kb verb also writes into.
 * @param {string} sink */
function routeEvents(sink) {
  return readdirSync(sink)
    .flatMap((slug) => {
      const file = join(sink, slug, "events.jsonl");
      return existsSync(file) ? readFileSync(file, "utf8").split("\n") : [];
    })
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((event) => event.component === "merge-policy");
}

test("--enforce emits one route event, and no record body with it", () => {
  const repo = materialize("docs-only");
  const sink = mkdtempSync(join(tmpdir(), "merge-policy-events-"));
  built.push(sink);
  route(
    repo,
    ["--range", "main..docs-only", "--repo-root", repo, "--json", "--enforce"],
    { STRAUSS_TELEMETRY_DIR: sink },
  );

  const events = routeEvents(sink);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "route");
  assert.equal(events[0].data.route, "auto");
  assert.equal(events[0].data.rule, "auto-mechanical");
  assert.equal(typeof events[0].durationMs, "number");
  assert.ok(!JSON.stringify(events[0]).includes("Considered"), "body leaked");
});

test("without --enforce no route event is emitted", () => {
  const repo = materialize("docs-only");
  const sink = mkdtempSync(join(tmpdir(), "merge-policy-quiet-"));
  built.push(sink);
  route(repo, ["--range", "main..docs-only", "--repo-root", repo, "--json"], {
    STRAUSS_TELEMETRY_DIR: sink,
  });
  // The kb verbs this run spawns emit their own events; none of them is ours.
  assert.deepEqual(routeEvents(sink), []);
});

test("a report with nowhere to go is a usage error, never a silent no-op", () => {
  const repo = materialize("docs-only");
  const base = ["--range", "main..docs-only", "--repo-root", repo, "--json"];

  const bare = route(repo, [...base, "--summary"], {
    GITHUB_STEP_SUMMARY: undefined,
  });
  assert.equal(bare.status, 2, bare.stderr);
  assert.match(bare.stderr, /GITHUB_STEP_SUMMARY/);

  // The staging file has nowhere to land either, so the rename never happens.
  const out = join(repo, "nowhere", "report.md");
  const unwritable = route(repo, [...base, "--report-out", out]);
  assert.equal(unwritable.status, 2, unwritable.stderr);
  assert.match(unwritable.stderr, /--report-out/);
  assert.ok(!existsSync(out));
});

test("a dry-run policy routes, writes nothing, and says dryRun in its event", () => {
  const { repo } = ownedRepo({
    policy: { enabled: "dry-run" },
    change: ["docs/guide.md", "# guide\n"],
  });
  const sink = mkdtempSync(join(tmpdir(), "merge-policy-dry-"));
  built.push(sink);
  const { status, model } = route(
    repo,
    [
      "--range",
      "main..topic",
      "--repo-root",
      repo,
      "--json",
      "--enforce",
      "--write-record",
      "--pr",
      "9",
      "--gate",
      '{"findings":[]}',
    ],
    { STRAUSS_TELEMETRY_DIR: sink },
  );

  assert.equal(model.route, "auto", model.reason);
  assert.equal(status, 0);
  // The config branch keeps strings: a boolean here is a regression.
  assert.strictEqual(model.policy.enabled, "dry-run");
  assert.equal(model.wrote.written, false);
  assert.match(model.wrote.why, /dry-run/);
  assert.ok(!existsSync(join(repo, ".strauss", "kb")));

  const events = routeEvents(sink);
  assert.equal(events.length, 1);
  assert.equal(events[0].data.dryRun, true);
  assert.equal(events[0].data.wrote, false);
});

test("a --pr-url that is not a github pull request is a usage error", () => {
  const { repo } = ownedRepo();
  const answer = route(repo, [
    "--range",
    "main..topic",
    "--repo-root",
    repo,
    "--json",
    "--pr-url",
    "https://evil.example/acme/app/pull/7",
  ]);
  assert.equal(answer.status, 2);
});
