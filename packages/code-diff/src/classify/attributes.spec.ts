import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { fakeGit, tempRepo, type TempRepo } from "../../test/repo.js";
import { attributeFiles, readAttributes } from "./attributes.js";
import { classifyFiles } from "./read.js";

const PATHS = [
  "pnpm-lock.yaml",
  "docs/a.md",
  "src/x.ts",
  "src/x.spec.ts",
  "src/raise.ts",
];

describe("readAttributes", () => {
  let repo: TempRepo;
  let base: string;

  beforeAll(() => {
    repo = tempRepo();
    repo.write(
      ".gitattributes",
      "pnpm-lock.yaml strauss-class=lockfile\ndocs/** linguist-documentation\n",
    );
    repo.write("src/x.ts", "export {};\n");
    base = repo.commit("base");
    // The branch marks its own source generated; the base does not agree.
    repo.write(
      ".gitattributes",
      "pnpm-lock.yaml strauss-class=lockfile\ndocs/** linguist-documentation\nsrc/** linguist-generated\nsrc/raise.ts strauss-class=source\n",
    );
    repo.commit("head");
  });

  afterAll(() => repo.cleanup());

  test("classes come from the base, not from the branch", async () => {
    const attributes = await readAttributes(repo.root, base, PATHS);
    expect(attributes).toMatchObject({
      pinned: true,
      repoDeclares: true,
      probeFailed: false,
    });
    expect(Object.fromEntries(attributes.classes)).toEqual({
      "pnpm-lock.yaml": {
        class: "lockfile",
        reason: "attribute strauss-class=lockfile",
      },
      "docs/a.md": {
        class: "docs",
        reason: "attribute linguist-documentation",
      },
    });
  });

  test("without a base only raising attributes apply, and the table is off", async () => {
    const attributes = await readAttributes(repo.root, null, PATHS);
    expect(attributes).toMatchObject({ pinned: false, repoDeclares: true });
    expect(Object.fromEntries(attributes.classes)).toEqual({
      "src/raise.ts": {
        class: "source",
        reason: "attribute strauss-class=source",
      },
    });
  });

  test.for([
    ["a base git cannot resolve", "no-such-branch"],
    ["an unsafe base", "--all"],
  ])("%s lowers nothing and keeps the table off", async ([, rev]) => {
    expect(await readAttributes(repo.root, rev as string, PATHS)).toEqual({
      classes: new Map(),
      repoDeclares: true,
      pinned: false,
      probeFailed: false,
      local: false,
    });
  });

  test("the clone's info/attributes lowers nothing, and the note says why", async () => {
    const file = join(repo.root, ".git/info/attributes");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "* linguist-generated\n");
    try {
      const attributes = await readAttributes(repo.root, base, PATHS);
      expect(attributes).toMatchObject({
        pinned: false,
        local: true,
        repoDeclares: true,
      });
      expect(attributes.classes.size).toBe(0);
      const result = await classifyFiles(
        repo.root,
        [{ filePath: "src/x.ts", hunks: [] }],
        { base },
      );
      expect(result.files[0]?.class).toBe("source");
      expect(result.notes?.[0]).toMatch(/\.git\/info\/attributes/);
    } finally {
      rmSync(file, { force: true });
    }
  });
});

describe("repoDeclares", () => {
  test.for([
    ["no .gitattributes", {}, ["src/a.ts"], false],
    [
      "a directory named like a class attribute",
      {},
      ["strauss-class/linguist-generated/a.ts"],
      false,
    ],
    [
      "only line endings",
      { ".gitattributes": "* text=auto eol=lf\n" },
      ["src/a.ts"],
      false,
    ],
    [
      "a root class",
      { ".gitattributes": "*.lock linguist-generated\n" },
      ["src/a.ts"],
      true,
    ],
    [
      "a class above a changed file",
      { "a/b/.gitattributes": "x strauss-class=ci\n" },
      ["a/b/c/x.ts"],
      true,
    ],
    [
      "a class in an unrelated directory",
      { "a/b/.gitattributes": "x strauss-class=ci\n" },
      ["src/a.ts"],
      false,
    ],
  ] as const)("%s → %s", async ([, files, paths, expected]) => {
    const repo = tempRepo();
    try {
      repo.write("src/a.ts", "export {};\n");
      for (const [path, text] of Object.entries(files)) repo.write(path, text);
      const base = repo.commit("base");
      expect((await readAttributes(repo.root, base, paths)).repoDeclares).toBe(
        expected,
      );
    } finally {
      repo.cleanup();
    }
  });

  test.skipIf(process.platform === "win32")(
    "a failed probe keeps the table off and says so",
    async () => {
      const repo = tempRepo();
      try {
        repo.write("src/a.ts", "export {};\n");
        const base = repo.commit("base");
        const restore = fakeGit("cat-file", "fatal: probe failed");
        try {
          const attributes = await readAttributes(repo.root, base, [
            "src/a.ts",
          ]);
          expect(attributes).toMatchObject({
            pinned: true,
            repoDeclares: true,
            probeFailed: true,
          });
        } finally {
          restore();
        }
      } finally {
        repo.cleanup();
      }
    },
  );

  test("outside a repository the table is off", async () => {
    const dir = mkdtempSync(join(tmpdir(), "code-diff-not-a-repo-"));
    try {
      expect((await readAttributes(dir, null, ["a.md"])).repoDeclares).toBe(
        true,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("attributeFiles", () => {
  test("the root's, then one per directory above a changed path", () => {
    expect(attributeFiles(["a/b/c.ts", "d.ts", "a/e.ts"])).toEqual([
      ".gitattributes",
      "a/.gitattributes",
      "a/b/.gitattributes",
    ]);
  });
});

describe("classifyFiles", () => {
  let repo: TempRepo;
  let base: string;

  beforeAll(() => {
    repo = tempRepo();
    repo.write(".gitattributes", "docs/** linguist-documentation\n");
    base = repo.commit("base");
    repo.write("docs/a.md", "# A\n");
    repo.write("src/gen.ts", "// Code generated by hand-rolled script\n");
    repo.write("README.md", "# Readme\n");
    repo.commit("head");
  });

  afterAll(() => repo.cleanup());

  const files = [
    { filePath: "docs/a.md", hunks: [] },
    { filePath: "src/gen.ts", hunks: [] },
    { filePath: "README.md", hunks: [] },
  ];

  test("attribute, banner, then source — the table is off here", async () => {
    const result = await classifyFiles(repo.root, files, { base });
    expect(result).toEqual({
      files: [
        {
          filePath: "docs/a.md",
          class: "docs",
          reason: "attribute linguist-documentation",
        },
        {
          filePath: "src/gen.ts",
          class: "generated",
          reason: "generated-header code generated by",
        },
        { filePath: "README.md", class: "source", reason: "default" },
      ],
    });
  });

  test("a subdirectory as the root reads the same repository", async () => {
    repo.write("src/keep.ts", "export {};\n");
    expect(
      await classifyFiles(join(repo.root, "src"), files, { base }),
    ).toEqual(await classifyFiles(repo.root, files, { base }));
  });

  test("no base lowers nothing, with a note", async () => {
    const result = await classifyFiles(repo.root, files, { base: null });
    expect(result.files.map((file) => file.class)).toEqual([
      "source",
      "generated",
      "source",
    ]);
    expect(result.notes).toEqual([
      "no base was given: only strauss-class=source applies, and the default path table is off",
    ]);
  });

  test("a base git cannot read is named in the note", async () => {
    const result = await classifyFiles(repo.root, files, {
      base: "no-such-branch",
    });
    expect(result.notes).toEqual([
      ".gitattributes could not be read at no-such-branch: only strauss-class=source applies, and the default path table is off",
    ]);
  });

  test.skipIf(process.platform === "win32")(
    "a committed symlink is not followed, even to a FIFO",
    async () => {
      const outside = mkdtempSync(join(tmpdir(), "code-diff-fifo-"));
      try {
        execFileSync("mkfifo", [join(outside, "pipe")]);
        symlinkSync(join(outside, "pipe"), join(repo.root, "src/pipe.ts"));
        symlinkSync(join(repo.root, "src/gen.ts"), join(repo.root, "link.ts"));
        const result = await classifyFiles(
          repo.root,
          [
            { filePath: "src/pipe.ts", hunks: [] },
            { filePath: "link.ts", hunks: [] },
          ],
          { base },
        );
        expect(result.files.map((file) => file.class)).toEqual([
          "source",
          "source",
        ]);
      } finally {
        rmSync(join(repo.root, "src/pipe.ts"), { force: true });
        rmSync(join(repo.root, "link.ts"), { force: true });
        rmSync(outside, { recursive: true, force: true });
      }
    },
    5_000,
  );
});
