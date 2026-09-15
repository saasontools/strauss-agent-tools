import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { tempRepo, type TempRepo } from "../test/repo.js";
import { gitEnv } from "./env.js";
import { runGit } from "./run.js";

describe("runGit", () => {
  let repo: TempRepo;
  let other: TempRepo;

  beforeAll(() => {
    repo = tempRepo();
    repo.write("a.txt", "a\n");
    repo.commit("first");
    other = tempRepo();
  });

  afterAll(() => {
    repo.cleanup();
    other.cleanup();
  });

  test("a zero exit carries stdout", async () => {
    const result = await runGit(["--version"]);
    expect(result.ok).toBe(true);
    expect(result.stdout).toMatch(/^git version /);
  });

  test("a non-zero exit is a result, not a throw", async () => {
    const result = await runGit(["rev-parse", "--verify", "--quiet", "nope"], {
      cwd: repo.root,
    });
    expect(result).toMatchObject({ ok: false, reason: "failed" });
  });

  test("output past the cap is too-large", async () => {
    const result = await runGit(["--version"], { maxBytes: 4 });
    expect(result).toMatchObject({ ok: false, reason: "too-large" });
  });

  test("input reaches the child's stdin", async () => {
    const expected = execFileSync("git", ["hash-object", "--stdin"], {
      input: "payload\n",
      encoding: "utf8",
    });
    const result = await runGit(["hash-object", "--stdin"], {
      input: "payload\n",
    });
    expect(result).toMatchObject({ ok: true, stdout: expected });
  });

  test("no git on PATH is its own reason", async () => {
    const saved = process.env["PATH"];
    process.env["PATH"] = mkdtempSync(join(tmpdir(), "git-guard-nopath-"));
    try {
      const result = await runGit(["--version"]);
      expect(result).toMatchObject({ ok: false, reason: "git-missing" });
    } finally {
      process.env["PATH"] = saved;
    }
  });

  test("GIT_DIR in the caller's environment does not redirect the read", async () => {
    const saved = process.env["GIT_DIR"];
    process.env["GIT_DIR"] = join(other.root, ".git");
    try {
      const result = await runGit(["rev-parse", "--show-toplevel"], {
        cwd: repo.root,
      });
      expect(result.ok).toBe(true);
      // `.native` expands Windows 8.3 names, which git never prints.
      expect(realpathSync.native(result.stdout.trim())).toBe(
        realpathSync.native(repo.root),
      );
    } finally {
      if (saved === undefined) delete process.env["GIT_DIR"];
      else process.env["GIT_DIR"] = saved;
    }
  });
});

describe("gitEnv", () => {
  test("drops redirects, keeps credentials, turns prompts off", () => {
    const env = gitEnv({
      PATH: "/bin",
      GIT_DIR: "/elsewhere/.git",
      GIT_WORK_TREE: "/elsewhere",
      GIT_INDEX_FILE: "/elsewhere/index",
      GIT_OBJECT_DIRECTORY: "/elsewhere/objects",
      GIT_EXTERNAL_DIFF: "rm -rf",
      GIT_SSH_COMMAND: "ssh -i key",
      GIT_CONFIG_GLOBAL: "/home/me/.gitconfig",
    });
    expect(env).toEqual({
      PATH: "/bin",
      GIT_SSH_COMMAND: "ssh -i key",
      GIT_CONFIG_GLOBAL: "/home/me/.gitconfig",
      GIT_TERMINAL_PROMPT: "0",
    });
  });
});
