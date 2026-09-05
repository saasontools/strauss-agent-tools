import { describe, expect, test } from "vitest";
import { parseUnifiedDiff } from "./parse-unified-diff.js";

const patch = (...lines: string[]) => `${lines.join("\n")}\n`;

describe("parseUnifiedDiff", () => {
  test("reads post-change line numbers from a modified file", () => {
    expect(
      parseUnifiedDiff(
        patch(
          "diff --git a/src/order.ts b/src/order.ts",
          "index 1111111..2222222 100644",
          "--- a/src/order.ts",
          "+++ b/src/order.ts",
          "@@ -10,3 +10,4 @@",
          "-old",
          "+new",
        ),
      ),
    ).toEqual([
      {
        filePath: "src/order.ts",
        hunks: [
          { startLine: 10, endLine: 13 },
          { startLine: 10, endLine: 12, side: "old" },
        ],
      },
    ]);
  });

  test("an omitted count means one line, on either side", () => {
    const [file] = parseUnifiedDiff(
      patch(
        "diff --git a/src/order.ts b/src/order.ts",
        "--- a/src/order.ts",
        "+++ b/src/order.ts",
        "@@ -4 +4 @@",
        "-old",
        "+new",
      ),
    );

    expect(file?.hunks).toEqual([
      { startLine: 4, endLine: 4 },
      { startLine: 4, endLine: 4, side: "old" },
    ]);
  });

  test("keeps every hunk of a file, in order", () => {
    const [file] = parseUnifiedDiff(
      patch(
        "diff --git a/src/order.ts b/src/order.ts",
        "--- a/src/order.ts",
        "+++ b/src/order.ts",
        "@@ -10,0 +11,2 @@",
        "+a",
        "+b",
        "@@ -40,2 +43,1 @@",
        "-c",
        "-d",
        "+e",
      ),
    );

    expect(file?.hunks).toEqual([
      { startLine: 11, endLine: 12 },
      { startLine: 43, endLine: 43 },
      { startLine: 40, endLine: 41, side: "old" },
    ]);
  });

  test("an added file is attributed to its new path", () => {
    expect(
      parseUnifiedDiff(
        patch(
          "diff --git a/src/new.ts b/src/new.ts",
          "new file mode 100644",
          "--- /dev/null",
          "+++ b/src/new.ts",
          "@@ -0,0 +1,3 @@",
          "+one",
          "+two",
          "+three",
        ),
      ),
    ).toEqual([
      { filePath: "src/new.ts", hunks: [{ startLine: 1, endLine: 3 }] },
    ]);
  });

  // A deleted file has no post-change lines, and a record anchored to it is
  // exactly what a reviewer needs to see.
  test("a deleted file keeps its old path and a single point hunk", () => {
    expect(
      parseUnifiedDiff(
        patch(
          "diff --git a/src/gone.ts b/src/gone.ts",
          "deleted file mode 100644",
          "--- a/src/gone.ts",
          "+++ /dev/null",
          "@@ -1,9 +0,0 @@",
          "-one",
        ),
      ),
    ).toEqual([
      {
        filePath: "src/gone.ts",
        hunks: [
          { startLine: 1, endLine: 1 },
          { startLine: 1, endLine: 9, side: "old" },
        ],
      },
    ]);
  });

  // The removed lines have no post-change numbering at all, so the old side is
  // the only place a record anchored to them can land.
  test("a deletion-only hunk carries an old-side hunk over the removed lines", () => {
    const [file] = parseUnifiedDiff(
      patch(
        "diff --git a/src/order.ts b/src/order.ts",
        "--- a/src/order.ts",
        "+++ b/src/order.ts",
        "@@ -12,3 +11,0 @@",
        "-one",
        "-two",
        "-three",
      ),
    );

    expect(file?.hunks).toEqual([
      { startLine: 11, endLine: 11 },
      { startLine: 12, endLine: 14, side: "old" },
    ]);
  });

  test("a rename that also changed lines is attributed to the new path", () => {
    expect(
      parseUnifiedDiff(
        patch(
          "diff --git a/src/old.ts b/src/new.ts",
          "similarity index 80%",
          "rename from src/old.ts",
          "rename to src/new.ts",
          "--- a/src/old.ts",
          "+++ b/src/new.ts",
          "@@ -7,1 +7,1 @@",
          "-old",
          "+new",
        ),
      ),
    ).toEqual([
      {
        filePath: "src/new.ts",
        hunks: [
          { startLine: 7, endLine: 7 },
          { startLine: 7, endLine: 7, side: "old" },
        ],
      },
    ]);
  });

  test("a pure rename and a binary change carry no hunk, so no file", () => {
    expect(
      parseUnifiedDiff(
        patch(
          "diff --git a/src/old.ts b/src/new.ts",
          "similarity index 100%",
          "rename from src/old.ts",
          "rename to src/new.ts",
          "diff --git a/assets/logo.png b/assets/logo.png",
          "index 3333333..4444444 100644",
          "Binary files a/assets/logo.png and b/assets/logo.png differ",
        ),
      ),
    ).toEqual([]);
  });

  test("an empty diff is an empty list", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });

  // With `--unified=0` a removed line of source reaches the parser verbatim,
  // and source that is itself a diff spells a file header.
  test("diff-shaped content inside a hunk is not read as a header", () => {
    expect(
      parseUnifiedDiff(
        patch(
          "diff --git a/docs/patch.md b/docs/patch.md",
          "--- a/docs/patch.md",
          "+++ b/docs/patch.md",
          "@@ -3,1 +3,2 @@",
          "--- a/decoy.ts",
          "+++ b/decoy.ts",
        ),
      ),
    ).toEqual([
      {
        filePath: "docs/patch.md",
        hunks: [
          { startLine: 3, endLine: 4 },
          { startLine: 3, endLine: 3, side: "old" },
        ],
      },
    ]);
  });

  test("unquotes a path git had to quote", () => {
    const [file] = parseUnifiedDiff(
      patch(
        'diff --git "a/src/or der.ts" "b/src/or der.ts"',
        '--- "a/src/or der.ts"',
        '+++ "b/src/or der.ts"',
        "@@ -1 +1 @@",
        "+x",
      ),
    );

    expect(file?.filePath).toBe("src/or der.ts");
  });

  // `readRangeDiff` pins `core.quotePath=false`, but a patch from elsewhere
  // arrives under git's default: UTF-8 bytes as octal escapes.
  test("decodes an octal-escaped non-ASCII path", () => {
    const [file] = parseUnifiedDiff(
      patch(
        String.raw`diff --git "a/src/caf\303\251.ts" "b/src/caf\303\251.ts"`,
        String.raw`--- "a/src/caf\303\251.ts"`,
        String.raw`+++ "b/src/caf\303\251.ts"`,
        "@@ -2 +2 @@",
        "+x",
      ),
    );

    expect(file?.filePath).toBe("src/café.ts");
  });

  test("takes an unquoted non-ASCII path as it stands", () => {
    const [file] = parseUnifiedDiff(
      patch(
        "diff --git a/src/café.ts b/src/café.ts",
        "--- a/src/café.ts",
        "+++ b/src/café.ts",
        "@@ -2 +2 @@",
        "+x",
      ),
    );

    expect(file?.filePath).toBe("src/café.ts");
  });

  test("a prefix pair it does not know comes off the `diff --git` line", () => {
    const [file] = parseUnifiedDiff(
      patch(
        "diff --git x/src/order.ts y/src/order.ts",
        "--- x/src/order.ts",
        "+++ y/src/order.ts",
        "@@ -10,1 +10,1 @@",
        "-old",
        "+new",
      ),
    );

    expect(file?.filePath).toBe("src/order.ts");
  });

  test("reads a patch whose lines end CRLF", () => {
    expect(
      parseUnifiedDiff(
        [
          "diff --git a/src/order.ts b/src/order.ts",
          "--- a/src/order.ts",
          "+++ b/src/order.ts",
          "@@ -10,3 +10,4 @@",
          "-old",
          "+new",
          "",
        ].join("\r\n"),
      ),
    ).toEqual([
      {
        filePath: "src/order.ts",
        hunks: [
          { startLine: 10, endLine: 13 },
          { startLine: 10, endLine: 12, side: "old" },
        ],
      },
    ]);
  });

  test("a mode-only change has no `---`/`+++`, so no hunk and no file", () => {
    expect(
      parseUnifiedDiff(
        patch(
          "diff --git a/scripts/run.sh b/scripts/run.sh",
          "old mode 100644",
          "new mode 100755",
        ),
      ),
    ).toEqual([]);
  });

  test("a missing trailing newline marker is not a line of the hunk", () => {
    const [file] = parseUnifiedDiff(
      patch(
        "diff --git a/src/order.ts b/src/order.ts",
        "--- a/src/order.ts",
        "+++ b/src/order.ts",
        "@@ -9 +9 @@",
        "-old",
        "\\ No newline at end of file",
        "+new",
        "\\ No newline at end of file",
      ),
    );

    expect(file?.hunks).toEqual([
      { startLine: 9, endLine: 9 },
      { startLine: 9, endLine: 9, side: "old" },
    ]);
  });

  test("section text after a hunk header is ignored", () => {
    const [file] = parseUnifiedDiff(
      patch(
        "diff --git a/src/order.ts b/src/order.ts",
        "--- a/src/order.ts",
        "+++ b/src/order.ts",
        "@@ -10,3 +10,4 @@ export function foo(",
        "+new",
      ),
    );

    expect(file?.hunks).toEqual([
      { startLine: 10, endLine: 13 },
      { startLine: 10, endLine: 12, side: "old" },
    ]);
  });
});
