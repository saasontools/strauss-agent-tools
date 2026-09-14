// @ts-check
/** A subagent's `changed` block: parsed, verified against the worktree, scoping the gate. */
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./kb-review-gate.mjs";
import { declaredPaths, undeclarable } from "./lib/declared.mjs";
import { statePath, writeState } from "./lib/state.mjs";

test("declaredPaths: the last changed block, normalised, or none", () => {
  assert.equal(declaredPaths(null), null);
  assert.equal(declaredPaths("no block here"), null);
  assert.deepEqual(declaredPaths("```changed\nnone\n```"), { declared: [], none: true });
  assert.deepEqual(
    declaredPaths("first\n```changed\nold.ts\n```\nthen\n```changed\n./src/a.ts\nsrc\\b.ts\n# comment\n\nsrc/a.ts\n```\n"),
    { declared: ["src/a.ts", "src/b.ts"], none: false },
  );
});

test("undeclarable: declared paths the worktree does not show as changed", () => {
  assert.deepEqual(undeclarable(["src/a.ts", "src/c.ts"], ["src/a.ts", "src/b.ts"]), ["src/c.ts"]);
  assert.deepEqual(undeclarable([], ["src/a.ts"]), []);
});

/** A repo with one commit, an armed gate, and one uncommitted change. */
function repoWithChange() {
  const repo = mkdtempSync(join(tmpdir(), "gate-declared-"));
  const git = (/** @type {string[]} */ args) =>
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
  git(["init", "--quiet", "--initial-branch", "main"]);
  mkdirSync(join(repo, "src"));
  mkdirSync(join(repo, ".strauss", "kb"), { recursive: true });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  writeFileSync(join(repo, ".strauss", "kb-pins.json"), JSON.stringify({ gate: {} }));
  git(["add", "."]);
  git(["commit", "--quiet", "-m", "base"]);
  const base = git(["rev-parse", "HEAD"]).trim();
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 2;\n");
  return { repo, base };
}

/** @param {string} dir @param {string} text */
function transcript(dir, text) {
  const path = join(dir, "agent.jsonl");
  writeFileSync(
    path,
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text }] } }),
  );
  return path;
}

test("SubagentStop: no block with a dirty worktree blocks; a false path blocks; the parent is never asked", async () => {
  const { repo, base } = repoWithChange();
  const session = `declared-${process.pid}`;
  writeState(statePath(session), { base, digest: null, stamp: null, blocked: 0 });
  /** @type {string[]} */
  const errors = [];
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = /** @type {any} */ ((/** @type {unknown} */ chunk) => {
    errors.push(String(chunk));
    return true;
  });
  const stop = (/** @type {string} */ text) =>
    main([], () =>
      JSON.stringify({
        session_id: session,
        hook_event_name: "SubagentStop",
        cwd: repo,
        agent_id: "sub-1",
        agent_transcript_path: transcript(repo, text),
      }),
    );
  try {
    assert.equal(await stop("done, no block"), 2);
    assert.match(errors.at(-1) ?? "", /fenced ```changed block/);
    assert.equal(await stop("```changed\nsrc/a.ts\nsrc/nope.ts\n```"), 2);
    assert.match(errors.at(-1) ?? "", /src\/nope\.ts/);
    // The parent's Stop never asks for a declaration.
    errors.length = 0;
    const parent = await main([], () =>
      JSON.stringify({ session_id: session, hook_event_name: "Stop", cwd: repo, transcript_path: transcript(repo, "x") }),
    );
    assert.ok(!errors.some((line) => /changed block/.test(line)), errors.join("\n"));
    void parent;
  } finally {
    process.stderr.write = write;
    rmSync(repo, { recursive: true, force: true });
  }
});
