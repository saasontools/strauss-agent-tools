import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { tempRepo, type TempRepo } from "../../test/repo.js";
import {
  parseRange,
  rangeRevs,
  readRangeDiff,
  readWorkingDiff,
} from "./diff.js";

/**
 * A real repository, because every refusal here is a real one: git's own exit,
 * the output cap, and no git at all are three different things to tell a
 * caller and only one of them is a shape check.
 */
const FILE = "src/café.ts";

describe("readRangeDiff", () => {
  let repo: TempRepo;

  beforeEach(() => {
    repo = tempRepo();
    repo.write(FILE, "one\ntwo\n");
    repo.commit("first");
    repo.write(FILE, "line\n".repeat(400));
    repo.commit("second");
  });

  afterEach(() => repo.cleanup());

  test("a non-ASCII path arrives unescaped, under the pinned prefixes", async () => {
    const diff = await readRangeDiff(repo.root, "HEAD~1..HEAD");

    expect(diff).toMatchObject({ ok: true });
    expect(diff.ok && diff.text).toContain("diff --git a/src/café.ts");
  });

  test("a rev git may not be handed is refused before a subprocess", async () => {
    expect(await readRangeDiff(repo.root, "-x..HEAD")).toEqual({
      ok: false,
      reason: "bad-range",
    });
  });

  test("a range missing one half is not a range", async () => {
    expect(await readRangeDiff(repo.root, "..HEAD")).toEqual({
      ok: false,
      reason: "bad-range",
    });
    expect(await readRangeDiff(repo.root, "HEAD")).toEqual({
      ok: false,
      reason: "bad-range",
    });
  });

  test("a rev this checkout does not have is a bad range too", async () => {
    expect(await readRangeDiff(repo.root, "nosuchref..HEAD")).toEqual({
      ok: false,
      reason: "bad-range",
    });
  });

  test("a patch past the cap says so rather than blaming the range", async () => {
    expect(await readRangeDiff(repo.root, "HEAD~1..HEAD", 64)).toEqual({
      ok: false,
      reason: "too-large",
    });
  });

  test("no git on PATH is its own reason", async () => {
    const path = process.env["PATH"];
    process.env["PATH"] = mkdtempSync(join(tmpdir(), "code-diff-nopath-"));
    try {
      expect(await readRangeDiff(repo.root, "HEAD~1..HEAD")).toEqual({
        ok: false,
        reason: "git-missing",
      });
    } finally {
      process.env["PATH"] = path;
    }
  });

  test("the working diff carries what is not yet committed", async () => {
    repo.write(FILE, "uncommitted\n");
    const diff = await readWorkingDiff(repo.root, "HEAD");
    expect(diff.ok && diff.text).toContain("+uncommitted");
    expect(await readWorkingDiff(repo.root, "-x")).toEqual({
      ok: false,
      reason: "bad-range",
    });
  });
});

describe("parseRange and rangeRevs", () => {
  test("both halves and the dots", () => {
    expect(parseRange("main...HEAD")).toEqual({
      base: "main",
      dots: "...",
      head: "HEAD",
    });
    expect(parseRange("a..b")).toEqual({ base: "a", dots: "..", head: "b" });
    expect(parseRange("a..-b")).toBeUndefined();
  });

  test("a null head is the working tree", () => {
    expect(rangeRevs("main", null)).toBe("main");
    expect(rangeRevs("main", "HEAD")).toBe("main..HEAD");
    expect(rangeRevs("-x", "HEAD")).toBeNull();
    expect(rangeRevs("main", "--all")).toBeNull();
  });
});
