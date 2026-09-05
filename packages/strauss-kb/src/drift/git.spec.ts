import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { readRangeDiff } from "./git.js";

/**
 * A real repository, because every refusal here is a real one: git's own exit,
 * the output cap, and no git at all are three different things to tell a
 * caller and only one of them is a shape check.
 */
const FILE = "src/café.ts";

describe("readRangeDiff", () => {
  let repo: string;

  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });

  const write = (contents: string) => {
    mkdirSync(dirname(join(repo, FILE)), { recursive: true });
    writeFileSync(join(repo, FILE), contents, "utf8");
  };

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "strauss-kb-range-diff-"));
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    write("one\ntwo\n");
    git("add", "-A");
    git("commit", "-qm", "first");
    write(`${"line\n".repeat(400)}`);
    git("add", "-A");
    git("commit", "-qm", "second");
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  test("a non-ASCII path arrives unescaped, under the pinned prefixes", async () => {
    const diff = await readRangeDiff(repo, "HEAD~1..HEAD");

    expect(diff).toMatchObject({ ok: true });
    expect(diff.ok && diff.text).toContain("diff --git a/src/café.ts");
  });

  test("a rev git may not be handed is refused before a subprocess", async () => {
    expect(await readRangeDiff(repo, "-x..HEAD")).toEqual({
      ok: false,
      reason: "bad-range",
    });
  });

  test("a range missing one half is not a range", async () => {
    expect(await readRangeDiff(repo, "..HEAD")).toEqual({
      ok: false,
      reason: "bad-range",
    });
    expect(await readRangeDiff(repo, "HEAD")).toEqual({
      ok: false,
      reason: "bad-range",
    });
  });

  test("a rev this checkout does not have is a bad range too", async () => {
    expect(await readRangeDiff(repo, "nosuchref..HEAD")).toEqual({
      ok: false,
      reason: "bad-range",
    });
  });

  test("a patch past the cap says so rather than blaming the range", async () => {
    expect(await readRangeDiff(repo, "HEAD~1..HEAD", 64)).toEqual({
      ok: false,
      reason: "too-large",
    });
  });

  test("no git on PATH is its own reason", async () => {
    const path = process.env["PATH"];
    process.env["PATH"] = "";
    try {
      expect(await readRangeDiff(repo, "HEAD~1..HEAD")).toEqual({
        ok: false,
        reason: "git-missing",
      });
    } finally {
      process.env["PATH"] = path;
    }
  });
});
