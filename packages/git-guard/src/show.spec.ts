import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { tempRepo, type TempRepo } from "../test/repo.js";
import { showAtRev } from "./show.js";

describe("showAtRev", () => {
  let repo: TempRepo;
  let base: string;

  beforeAll(() => {
    repo = tempRepo();
    repo.write("src/a.ts", "export const a = 1;\n");
    base = repo.commit("base");
    repo.write("src/a.ts", "export const a = 2;\n");
    repo.commit("head");
  });

  afterAll(() => repo.cleanup());

  test("the file as it was at the rev", async () => {
    expect(await showAtRev(repo.root, base, "src/a.ts")).toBe(
      "export const a = 1;\n",
    );
    expect(await showAtRev(repo.root, "HEAD", "./src/a.ts")).toBe(
      "export const a = 2;\n",
    );
  });

  test.for([
    ["a directory", "HEAD", "src"],
    ["a missing path", "HEAD", "src/missing.ts"],
    ["a rev shaped as an option", "--output=x", "src/a.ts"],
    ["a path climbing out", "HEAD", "../a.ts"],
    ["a path shaped as an option", "HEAD", "-p"],
  ])("%s is null", async ([, rev, path]) => {
    expect(await showAtRev(repo.root, rev as string, path as string)).toBe(
      null,
    );
  });
});
