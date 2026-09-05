// @ts-check
/** The hook's own behaviour: loop guard, idle path, twice-blocked demotion. */
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./kb-review-gate.mjs";
import { render } from "./lib/report.mjs";
import { launcher, run } from "./lib/cli.mjs";
import { readState, statePath, writeState } from "./lib/state.mjs";

/**
 * The idle path is git plus a directory scan — measured at ~50 ms. The bound
 * is a smoke check only (the spawn sentinel below is the real assertion), so
 * it carries enough headroom for a host running the whole workspace in parallel.
 */
const IDLE_BUDGET_MS = 2000;

/**
 * A launcher that records every spawn instead of being one, so "no CLI on the
 * idle path" is an assertion about what ran rather than about elapsed time.
 * @param {string} dir
 */
function sentinelBin(dir) {
  const script = join(dir, "sentinel.mjs");
  const marker = join(dir, "spawned.log");
  writeFileSync(
    script,
    [
      'import { appendFileSync } from "node:fs";',
      `appendFileSync(${JSON.stringify(marker)}, JSON.stringify(process.argv.slice(2)) + "\\n");`,
      "process.stdout.write('[]');",
    ].join("\n"),
  );
  return { script, marker };
}

/** @param {string} marker */
function spawns(marker) {
  try {
    return readFileSync(marker, "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/** A one-commit repository with an armed gate and one uncovered code file. */
function scratchRepo() {
  const repo = mkdtempSync(join(tmpdir(), "gate-hook-"));
  const run = (/** @type {string[]} */ args) =>
    execFileSync("git", ["-c", "commit.gpgsign=false", "-C", repo, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@example.invalid",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@example.invalid",
      },
    });
  run(["init", "--quiet", "--initial-branch", "main"]);
  mkdirSync(join(repo, "src"), { recursive: true });
  mkdirSync(join(repo, ".strauss", "kb"), { recursive: true });
  writeFileSync(
    join(repo, ".strauss", "kb-pins.json"),
    JSON.stringify({ gate: {} }),
  );
  writeFileSync(
    join(repo, "src", "a.ts"),
    "export function alpha() {\n  return 1;\n}\n",
  );
  run(["add", "--all"]);
  run(["commit", "--quiet", "-m", "base"]);
  const base = run(["rev-parse", "HEAD"]).trim();
  return { repo, base, run };
}

/** @param {string} repo @param {string} session @param {Record<string, unknown>} extra */
function payload(repo, session, extra = {}) {
  return JSON.stringify({
    session_id: session,
    hook_event_name: "Stop",
    cwd: repo,
    ...extra,
  });
}

test("stop_hook_active exits 0 without reading anything", async () => {
  const { repo } = scratchRepo();
  try {
    const code = await main([], () =>
      payload(repo, "loop-guard", { stop_hook_active: true }),
    );
    assert.equal(code, 0);
    assert.equal(readState(statePath("loop-guard")).digest, null);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("--session-start records the base commit", async () => {
  const { repo, base } = scratchRepo();
  const session = `start-${process.pid}`;
  try {
    await main(["--session-start"], () =>
      payload(repo, session, { hook_event_name: "SessionStart" }),
    );
    assert.equal(readState(statePath(session)).base, base);
  } finally {
    rmSync(statePath(session), { force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

test("an unchanged digest and stamp exit fast, with no CLI spawn", async () => {
  const { repo, base, run: gitRun } = scratchRepo();
  const session = `idle-${process.pid}`;
  const path = statePath(session);
  const { script, marker } = sentinelBin(repo);
  const writeErr = process.stderr.write.bind(process.stderr);
  process.stderr.write = () => true;
  try {
    writeFileSync(
      join(repo, "src", "a.ts"),
      "export function alpha() {\n  return 2;\n}\n",
    );
    gitRun(["commit", "--quiet", "--all", "-m", "change"]);
    writeState(path, { base, digest: null, stamp: null, blocked: 0 });

    // A run that fills the state in, then five that must take the short path.
    process.env.STRAUSS_KB_BIN = script;
    await main([], () => payload(repo, session));
    const warm = readState(path);
    assert.ok(warm.digest);
    assert.ok(spawns(marker).length > 0, "the full run spawns the CLI");
    rmSync(marker, { force: true });

    const start = process.hrtime.bigint();
    for (let index = 0; index < 5; index += 1) {
      assert.equal(await main([], () => payload(repo, session)), 0);
    }
    const each = Number(process.hrtime.bigint() - start) / 5e6;
    assert.deepEqual(spawns(marker), [], "the idle path spawned the CLI");
    assert.ok(each < IDLE_BUDGET_MS, `idle path took ${each.toFixed(1)}ms`);
  } finally {
    process.stderr.write = writeErr;
    delete process.env.STRAUSS_KB_BIN;
    rmSync(path, { force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a bundle path with a shell metacharacter stays one argv token", () => {
  const dir = mkdtempSync(join(tmpdir(), "gate-argv-"));
  const { script, marker } = sentinelBin(dir);
  const bundle = join(dir, "a & b", ".strauss", "kb");
  try {
    process.env.STRAUSS_KB_BIN = script;
    run(launcher(dir, bundle), ["load", "--all"]);
    assert.deepEqual(JSON.parse(spawns(marker)[0] ?? "[]"), [
      "--bundle",
      bundle,
      "load",
      "--all",
    ]);
  } finally {
    delete process.env.STRAUSS_KB_BIN;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the blocked block is sanitised, bounded and capped", () => {
  const findings = Array.from({ length: 200 }, (_, index) => ({
    id: `A${index}`,
    family: index % 2 === 0 ? "A" : "C",
    severity: /** @type {const} */ ("block"),
    kind: /** @type {const} */ ("semantic"),
    message: `decision.x\u0000\u001b[2J\r\n${"very long ".repeat(60)}${index}`,
  }));
  const text = render(findings);
  assert.ok(Buffer.byteLength(text) <= 2048, `block was ${text.length} chars`);
  for (const line of text.split("\n")) {
    assert.doesNotMatch(line, /\p{Cc}/u, "a control character reached stderr");
    assert.ok(line.length <= 200, line);
  }
  assert.match(text, /\+95 more/);
});

test("the same digest blocked twice is warned through the third time", async () => {
  const { repo, base, run } = scratchRepo();
  const session = `blocked-${process.pid}`;
  const path = statePath(session);
  /** @type {string[]} */
  const stdout = [];
  const write = process.stdout.write.bind(process.stdout);
  const writeErr = process.stderr.write.bind(process.stderr);
  process.stderr.write = () => true;
  try {
    writeFileSync(
      join(repo, "src", "a.ts"),
      "export function alpha() {\n  return 3;\n}\n",
    );
    run(["commit", "--quiet", "--all", "-m", "silent change"]);
    process.env.STRAUSS_KB_BIN = "strauss-kb-does-not-exist";

    assert.equal(
      await main([], () => payload(repo, session)),
      0,
      "no base, no diff",
    );
    writeState(path, { base, digest: null, stamp: null, blocked: 0 });
    assert.equal(await main([], () => payload(repo, session)), 2);
    assert.equal(readState(path).blocked, 1);

    const digest = readState(path).digest;
    writeState(path, { base, digest, stamp: null, blocked: 2 });
    process.stdout.write = (/** @type {any} */ chunk) => (
      stdout.push(String(chunk)),
      true
    );
    assert.equal(await main([], () => payload(repo, session)), 0);
    assert.match(stdout.join(""), /blocked 2 times/);
  } finally {
    process.stdout.write = write;
    process.stderr.write = writeErr;
    delete process.env.STRAUSS_KB_BIN;
    rmSync(path, { force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a block writes findings and the companion line to stderr", async () => {
  const { repo, base, run } = scratchRepo();
  const session = `stderr-${process.pid}`;
  const path = statePath(session);
  /** @type {string[]} */
  const captured = [];
  const write = process.stderr.write.bind(process.stderr);
  try {
    writeFileSync(
      join(repo, "src", "a.ts"),
      "export function alpha() {\n  return 4;\n}\n",
    );
    run(["commit", "--quiet", "--all", "-m", "silent change"]);
    writeState(path, { base, digest: null, stamp: null, blocked: 0 });
    process.env.STRAUSS_KB_BIN = "strauss-kb-does-not-exist";
    process.stderr.write = (/** @type {any} */ chunk) => (
      captured.push(String(chunk)),
      true
    );
    assert.equal(await main([], () => payload(repo, session)), 2);
    const text = captured.join("");
    assert.match(text, /^A\. Silence/m);
    assert.match(text, /\[A1\]/);
    assert.match(text, /load review-companion\n$/);
  } finally {
    process.stderr.write = write;
    delete process.env.STRAUSS_KB_BIN;
    rmSync(path, { force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

test("a record written this turn and never committed counts as coverage", async () => {
  const { repo, base, run: gitRun } = scratchRepo();
  const session = `untracked-${process.pid}`;
  const path = statePath(session);
  /** @type {string[]} */
  const captured = [];
  const write = process.stderr.write.bind(process.stderr);
  try {
    writeFileSync(
      join(repo, "src", "a.ts"),
      "export function alpha() {\n  return 5;\n}\n",
    );
    gitRun(["commit", "--quiet", "--all", "-m", "the change"]);
    // Written by this turn's `kb_write`: never added, so no diff lists it.
    writeFileSync(
      join(repo, ".strauss", "kb", "decision.alpha.md"),
      [
        "---",
        "type: decision",
        "title: alpha returns the retry count",
        "strauss_anchors:",
        "  - file: src/a.ts",
        "    symbol: alpha",
        "---",
        "## Decision",
        "",
        "The counter is what callers page on, so it is what alpha hands back.",
        "",
        "## Rejected",
        "",
        "Returning the elapsed milliseconds, which no alert reads.",
        "",
      ].join("\n"),
    );
    writeState(path, { base, digest: null, stamp: null, blocked: 0 });
    process.env.STRAUSS_KB_BIN = "strauss-kb-does-not-exist";
    process.stderr.write = (/** @type {any} */ chunk) => (
      captured.push(String(chunk)),
      true
    );
    const code = await main([], () => payload(repo, session));
    assert.doesNotMatch(captured.join(""), /\[A1\]/);
    assert.equal(code, 0, captured.join(""));
  } finally {
    process.stderr.write = write;
    delete process.env.STRAUSS_KB_BIN;
    rmSync(path, { force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

test("an unarmed workspace is a no-op", async () => {
  const { repo, base } = scratchRepo();
  const session = `unarmed-${process.pid}`;
  const path = statePath(session);
  try {
    rmSync(join(repo, ".strauss", "kb-pins.json"), { force: true });
    writeState(path, { base, digest: null, stamp: null, blocked: 0 });
    assert.equal(await main([], () => payload(repo, session)), 0);
  } finally {
    rmSync(path, { force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});
