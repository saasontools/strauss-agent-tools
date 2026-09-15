import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { tempRepo, type TempRepo } from "../test/repo.js";
import { checkAttr } from "./check-attr.js";

const ATTRS = ["linguist-generated", "linguist-documentation", "strauss-class"];
const PATHS = ["deps.lock", "docs/a b.md", "src/y.ts", "src/y.spec.ts"];

describe("checkAttr", () => {
  let repo: TempRepo;
  let base: string;

  beforeAll(() => {
    repo = tempRepo();
    repo.write(
      ".gitattributes",
      "*.lock linguist-generated\ndocs/** linguist-documentation\n*.spec.ts strauss-class=test\n",
    );
    repo.write("src/y.ts", "export {};\n");
    base = repo.commit("base");
    // The head claims its own source is generated; read at base, it is not.
    repo.write(
      ".gitattributes",
      "*.lock linguist-generated\ndocs/** linguist-documentation\n*.spec.ts strauss-class=test\nsrc/** linguist-generated\n",
    );
    repo.commit("head");
  });

  afterAll(() => repo.cleanup());

  test("attributes are read at the source commit, not at head", async () => {
    const { attrs, pinned } = await checkAttr(repo.root, base, PATHS, ATTRS);
    expect(pinned).toBe(true);
    expect(Object.fromEntries(attrs)).toEqual({
      "deps.lock": { "linguist-generated": "set" },
      "docs/a b.md": { "linguist-documentation": "set" },
      "src/y.spec.ts": { "strauss-class": "test" },
    });
  });

  test("no source reads the working tree and says so", async () => {
    const { attrs, pinned } = await checkAttr(repo.root, null, PATHS, ATTRS);
    expect(pinned).toBe(false);
    expect(attrs.get("src/y.ts")).toEqual({ "linguist-generated": "set" });
  });

  test("a source git cannot read falls back to the working tree", async () => {
    const { attrs, pinned } = await checkAttr(
      repo.root,
      "no-such-branch",
      ["src/y.ts"],
      ATTRS,
    );
    expect(pinned).toBe(false);
    expect(attrs.get("src/y.ts")).toEqual({ "linguist-generated": "set" });
  });

  test("an unsafe source reads nothing", async () => {
    const { attrs, pinned } = await checkAttr(repo.root, "--all", PATHS, ATTRS);
    expect(pinned).toBe(false);
    expect(attrs.size).toBe(0);
  });

  test("an unsafe attribute name is a programming error", async () => {
    await expect(checkAttr(repo.root, base, PATHS, ["--all"])).rejects.toThrow(
      /unsafe attribute/,
    );
  });

  test("no paths spawns nothing and reads as pinned to the source", async () => {
    expect(await checkAttr(repo.root, base, [], ATTRS)).toEqual({
      attrs: new Map(),
      pinned: true,
    });
  });
});
