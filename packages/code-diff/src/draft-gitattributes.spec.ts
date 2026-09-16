import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { tempRepo } from "../test/repo.js";
import {
  draftGitattributes,
  draftGitattributesFrom,
} from "./draft-gitattributes.js";

describe("draftGitattributesFrom", () => {
  test("one line per kind of file the index holds", () => {
    expect(
      draftGitattributesFrom([
        "pnpm-lock.yaml",
        "crates/a/Cargo.lock",
        ".github/workflows/ci.yml",
        ".gitlab-ci.yml",
        "src/__tests__/a.ts",
        "packages/a/test/helpers.ts",
        "src/a.spec.ts",
        "src/b.test.tsx",
        "docs/guide.md",
        "packages/a/dist/index.js",
        "vendor/lib.js",
        "node_modules/x/build/y.js",
        "src/index.ts",
      ]),
    ).toBe(
      [
        "pnpm-lock.yaml strauss-class=lockfile",
        "Cargo.lock strauss-class=lockfile",
        ".github/** strauss-class=ci",
        ".gitlab-ci.yml strauss-class=ci",
        "**/__tests__/** strauss-class=test",
        "**/test/** strauss-class=test",
        "*.spec.* strauss-class=test",
        "*.test.* strauss-class=test",
        "docs/** linguist-documentation",
        "**/dist/** linguist-generated",
        "**/vendor/** linguist-vendored",
        "",
      ].join("\n"),
    );
  });

  test("nothing to propose is an empty draft", () => {
    expect(draftGitattributesFrom(["src/index.ts", "README.md"])).toBe("");
  });
});

describe("draftGitattributes", () => {
  test("reads the index, never the working tree's untracked files", async () => {
    const repo = tempRepo();
    try {
      repo.write("yarn.lock", "");
      repo.commit("lock");
      repo.write("src/untracked.spec.ts", "");
      expect(await draftGitattributes(repo.root)).toBe(
        "yarn.lock strauss-class=lockfile\n",
      );
    } finally {
      repo.cleanup();
    }
  });

  test("outside a repository there is no draft", async () => {
    const dir = mkdtempSync(join(tmpdir(), "code-diff-not-a-repo-"));
    try {
      expect(await draftGitattributes(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
