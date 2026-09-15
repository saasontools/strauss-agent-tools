import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { tempRepo, type TempRepo } from "../../test/repo.js";
import { digest } from "../digest.js";
import { changedFiles } from "./changed-files.js";
import { commits } from "./commits.js";
import { head } from "./head.js";
import { uncommittedPaths } from "./uncommitted-paths.js";

describe("repository reads", () => {
  let repo: TempRepo;
  let base: string;
  let first: string;
  let second: string;

  beforeAll(() => {
    repo = tempRepo();
    repo.write("a.ts", "export const a = 1;\n");
    repo.write(
      "b.ts",
      "export const shared = 'the same bytes on both sides';\n",
    );
    repo.write(".strauss/kb/tracked.md", "one\n");
    base = repo.commit("base");
    repo.write("a.ts", "export const a = 2;\n");
    first = repo.commit("change a");
    repo.git("mv", "b.ts", "c.ts");
    repo.write("d e.ts", "export {};\n");
    second = repo.commit("rename b, add d e");
  });

  afterAll(() => repo.cleanup());

  test("changedFiles reads statuses and renames, spaces and all", async () => {
    const files = await changedFiles(repo.root, base, "HEAD");
    expect(files).toHaveLength(3);
    expect(files).toEqual(
      expect.arrayContaining([
        { path: "a.ts", status: "M" },
        { path: "c.ts", oldPath: "b.ts", status: "R" },
        { path: "d e.ts", status: "A" },
      ]),
    );
  });

  test("a null head diffs the base against the working tree", async () => {
    repo.write("a.ts", "export const a = 3;\n");
    try {
      const files = await changedFiles(repo.root, "HEAD", null);
      expect(files).toEqual([{ path: "a.ts", status: "M" }]);
    } finally {
      repo.git("checkout", "--", "a.ts");
    }
  });

  test("an unsafe rev or an unknown one is null, not an empty diff", async () => {
    expect(await changedFiles(repo.root, "-x", "HEAD")).toBeNull();
    expect(await changedFiles(repo.root, "nosuchref", "HEAD")).toBeNull();
  });

  test("commits come oldest first, each with its paths", async () => {
    const list = await commits(repo.root, base);
    expect(list?.map((commit) => commit.sha)).toEqual([first, second]);
    expect(list?.[0]?.paths).toEqual(["a.ts"]);
    // A rename lists the path it landed on.
    expect(list?.[1]?.paths.sort()).toEqual(["c.ts", "d e.ts"]);
    expect(await commits(repo.root, "--all")).toBeNull();
  });

  test("uncommittedPaths holds untracked and modified files under the dir", async () => {
    repo.write(".strauss/kb/new.md", "new\n");
    repo.write(".strauss/kb/tracked.md", "two\n");
    repo.write("outside.md", "not under the dir\n");
    try {
      expect(
        (await uncommittedPaths(repo.root, ".strauss/kb"))?.sort(),
      ).toEqual([".strauss/kb/new.md", ".strauss/kb/tracked.md"]);
      expect(await uncommittedPaths(repo.root, "../x")).toBeNull();
    } finally {
      repo.git("checkout", "--", ".strauss/kb/tracked.md");
      rmSync(join(repo.root, ".strauss/kb/new.md"));
      rmSync(join(repo.root, "outside.md"));
    }
  });

  test("head is the sha, or null outside a repository", async () => {
    expect(await head(repo.root)).toBe(second);
    const bare = mkdtempSync(join(tmpdir(), "code-diff-not-a-repo-"));
    try {
      expect(await head(bare)).toBeNull();
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  test("digest is sha256 hex", () => {
    expect(digest("x")).toBe(
      "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881",
    );
  });
});
