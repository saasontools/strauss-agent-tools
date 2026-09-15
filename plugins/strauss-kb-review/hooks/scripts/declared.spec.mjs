// @ts-check
/** A subagent's `changed` block: parsed, verified against the worktree, scoping the gate. */
import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./kb-review-gate.mjs";
import { attributeClass, attributeClasses } from "./lib/classify.mjs";
import { declaredPaths, unbackedClasses, undeclarable, writtenScope } from "./lib/declared.mjs";
import { checkAttr } from "./lib/git.mjs";
import { statePath, writeState } from "./lib/state.mjs";

test("declaredPaths: the last changed block, JSON body, normalised paths, or none", () => {
  assert.equal(declaredPaths(null), null);
  assert.equal(declaredPaths("no block here"), null);
  assert.match(String(declaredPaths("```changed\nnot json\n```")?.error), /not JSON/);
  assert.match(String(declaredPaths("```changed\n{ \"files\": [] }\n```")?.error), /`paths` array/);
  assert.match(String(declaredPaths("```changed\n{ \"paths\": [ { \"class\": \"docs\" } ] }\n```")?.error), /paths\[0\] has no/);
  assert.match(String(declaredPaths("```changed\n{ \"paths\": [ { \"path\": \"a\", \"class\": 3 } ] }\n```")?.error), /class must be/);
  assert.deepEqual(declaredPaths("```changed\n{ \"paths\": [] }\n```"), { declared: [], classes: new Map(), none: true, error: null });
  const text = [
    "first",
    "```changed",
    '{ "paths": [ { "path": "old.ts" } ] }',
    "```",
    "then",
    "```changed",
    '{ "paths": [ { "path": "./src/a.ts" }, { "path": "src\\\\b.ts", "class": "Generated" }, "src/a.ts" ] }',
    "```",
  ].join("\n");
  assert.deepEqual(declaredPaths(text), {
    declared: ["src/a.ts", "src/b.ts"],
    classes: new Map([["src/b.ts", "generated"]]),
    none: false,
    error: null,
  });
});

test("writtenScope: the diff's paths plus the declared or scraped bundle files", () => {
  assert.deepEqual(
    [...writtenScope(new Set(["src/a.ts"]), [".strauss/kb/risk.a.md", "src/b.ts", "./.strauss/kb/decision.b.md"], ".strauss/kb")].sort(),
    [".strauss/kb/decision.b.md", ".strauss/kb/risk.a.md", "src/a.ts"],
  );
  assert.deepEqual([...writtenScope(new Set(), [], ".strauss/kb")], []);
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
    assert.match(errors.at(-1) ?? "", /fenced ```changed block whose body is JSON/);
    assert.equal(await stop("```changed\nnot json\n```"), 2);
    assert.match(errors.at(-1) ?? "", /present but invalid: the body is not JSON/);
    assert.equal(await stop('```changed\n{ "paths": [ { "path": "src/a.ts" }, { "path": "src/nope.ts" } ] }\n```'), 2);
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

test("unbackedClasses: a lowering class the repository does not back, and nothing else", () => {
  const lowering = new Set(["generated", "docs", "test"]);
  const declared = new Map([
    ["src/gen/api.ts", "generated"],
    ["src/a.ts", "source"],
    ["docs/guide.md", "docs"],
    ["src/b.ts", "test"],
  ]);
  const classes = new Map([
    ["src/gen/api.ts", "source"],
    ["docs/guide.md", "docs"],
    ["src/b.ts", "source"],
  ]);
  assert.deepEqual(unbackedClasses(declared, classes, lowering), [
    { path: "src/gen/api.ts", claimed: "generated", actual: "source" },
    { path: "src/b.ts", claimed: "test", actual: "source" },
  ]);
});

test("attributeClass: linguist and strauss-class attributes map to classes", () => {
  assert.equal(attributeClass({ "linguist-generated": "set" }), "generated");
  assert.equal(attributeClass({ "linguist-vendored": "true" }), "generated");
  assert.equal(attributeClass({ "linguist-documentation": "set" }), "docs");
  assert.equal(attributeClass({ "strauss-class": "test" }), "test");
  assert.equal(attributeClass({ "strauss-class": "kernel" }), null);
  assert.equal(attributeClass({ "linguist-generated": "unset" }), null);
});

test("checkAttr reads .gitattributes at the base commit, not the branch", () => {
  const { repo, base } = repoWithChange();
  const git = (/** @type {string[]} */ args) =>
    execFileSync("git", ["-c", "commit.gpgsign=false", "-C", repo, ...args], {
      encoding: "utf8",
      env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" },
    });
  try {
    writeFileSync(join(repo, ".gitattributes"), "src/a.ts linguist-generated\n");
    git(["add", ".gitattributes"]);
    git(["commit", "--quiet", "-m", "attrs"]);
    const withAttrs = git(["rev-parse", "HEAD"]).trim();
    // At `base` the file was not marked; on the branch it is.
    const before = checkAttr(repo, base, ["src/a.ts"], ["linguist-generated"]);
    const after = checkAttr(repo, withAttrs, ["src/a.ts"], ["linguist-generated"]);
    if (before.pinned) {
      assert.equal(before.attrs.get("src/a.ts"), undefined);
    }
    assert.equal(after.attrs.get("src/a.ts")?.["linguist-generated"], "set");
    assert.deepEqual(attributeClasses(repo, withAttrs, ["src/a.ts", "src/none.ts"]), new Map([["src/a.ts", "generated"]]));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
