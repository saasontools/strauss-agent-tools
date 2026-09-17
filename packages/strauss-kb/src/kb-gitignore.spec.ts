import { describe, expect, test } from "vitest";
import {
  appendIgnoreLines,
  BUNDLE_GITIGNORE_BLOCK,
  BUNDLE_IGNORE_RULES,
  missingIgnoreLines,
  STRAUSS_GITIGNORE_BLOCK,
  STRAUSS_IGNORE_RULES,
} from "./kb-gitignore.js";

describe("the rules themselves", () => {
  test("anchor each pattern to its own directory, never reaching up", () => {
    expect(BUNDLE_GITIGNORE_BLOCK).toBe("/.index.sqlite*\n");
    expect(STRAUSS_GITIGNORE_BLOCK).toBe("/kb-pins.local.json\n");
  });
});

describe("missingIgnoreLines", () => {
  test("asks for the rule a fresh file lacks", () => {
    expect(missingIgnoreLines("", BUNDLE_IGNORE_RULES)).toEqual([
      "/.index.sqlite*",
    ]);
  });

  test("asks for nothing once the block is present", () => {
    expect(
      missingIgnoreLines(BUNDLE_GITIGNORE_BLOCK, BUNDLE_IGNORE_RULES),
    ).toEqual([]);
  });

  test("asks for nothing when a user's own pattern already covers the files", () => {
    expect(missingIgnoreLines("*.sqlite*\n", BUNDLE_IGNORE_RULES)).toEqual([]);
    expect(missingIgnoreLines(".index.sqlite*\n", BUNDLE_IGNORE_RULES)).toEqual(
      [],
    );
  });

  // The sidecars are the point: a pattern naming the database alone leaves
  // `-wal` and `-shm` tracked, so the rule is still owed.
  test("still asks when a user's pattern covers the database but not its sidecars", () => {
    expect(missingIgnoreLines("/.index.sqlite\n", BUNDLE_IGNORE_RULES)).toEqual(
      ["/.index.sqlite*"],
    );
  });

  // git resolves repeated matches by "last one wins", so appending over a
  // negation would overrule a deliberate choice to track the file.
  test("leaves a deliberate negation alone", () => {
    expect(
      missingIgnoreLines("*.sqlite*\n!.index.sqlite\n", BUNDLE_IGNORE_RULES),
    ).toEqual([]);
  });

  // git keeps leading whitespace as part of the pattern, so `  *.sqlite*`
  // matches a name starting with two spaces and covers nothing here. Reading
  // it as a match is the one wrong direction: a redundant rule is harmless, a
  // missing one leaves the index tracked.
  test("gives a leading-whitespace pattern the meaning git gives it", () => {
    expect(missingIgnoreLines("  *.sqlite*\n", BUNDLE_IGNORE_RULES)).toEqual([
      "/.index.sqlite*",
    ]);
    expect(
      missingIgnoreLines("*.sqlite*\n  !.index.sqlite\n", BUNDLE_IGNORE_RULES),
    ).toEqual([]);
  });

  test("strips trailing whitespace and a CRLF line ending", () => {
    expect(missingIgnoreLines("*.sqlite*  \r\n", BUNDLE_IGNORE_RULES)).toEqual(
      [],
    );
  });

  // A regex of adjacent `[^/]*` groups backtracks for minutes on this line;
  // the scan answers in microseconds. The file is data that arrives with a
  // clone, and every mutation reads it synchronously.
  test("answers a pathological run of stars immediately", () => {
    const started = performance.now();

    expect(
      missingIgnoreLines(`${"*".repeat(40)}X\n`, BUNDLE_IGNORE_RULES),
    ).toEqual(["/.index.sqlite*"]);

    expect(performance.now() - started).toBeLessThan(100);
  });

  test("ignores comments and blank lines", () => {
    expect(
      missingIgnoreLines("# /.index.sqlite*\n\n", BUNDLE_IGNORE_RULES),
    ).toEqual(["/.index.sqlite*"]);
  });

  // A directory pattern matches no file, and a pattern with a path separator
  // addresses something deeper than the file beside the ignore file.
  test("does not credit a directory pattern or a deeper path", () => {
    expect(
      missingIgnoreLines(".index.sqlite*/\n", BUNDLE_IGNORE_RULES),
    ).toEqual(["/.index.sqlite*"]);
    expect(
      missingIgnoreLines("kb/.index.sqlite*\n", BUNDLE_IGNORE_RULES),
    ).toEqual(["/.index.sqlite*"]);
  });

  // The committed manifest must stay trackable: the rule names the personal
  // file exactly, and `kb-pins.json` is not a prefix match for it.
  test("the local-pins rule does not cover the committed manifest", () => {
    expect(missingIgnoreLines("/kb-pins.json\n", STRAUSS_IGNORE_RULES)).toEqual(
      ["/kb-pins.local.json"],
    );
  });
});

describe("appendIgnoreLines", () => {
  test("adds no leading separator to an empty file", () => {
    expect(appendIgnoreLines("", BUNDLE_IGNORE_RULES)).toBe(
      BUNDLE_GITIGNORE_BLOCK,
    );
  });

  test("adds no separator when the existing content ends in a newline", () => {
    expect(appendIgnoreLines("*.tmp\n", BUNDLE_IGNORE_RULES)).toBe(
      BUNDLE_GITIGNORE_BLOCK,
    );
  });

  test("adds a separating newline when the existing content does not end in one", () => {
    expect(appendIgnoreLines("*.tmp", BUNDLE_IGNORE_RULES)).toBe(
      `\n${BUNDLE_GITIGNORE_BLOCK}`,
    );
  });

  test("returns nothing to append when the rule is already settled", () => {
    expect(appendIgnoreLines(BUNDLE_GITIGNORE_BLOCK, BUNDLE_IGNORE_RULES)).toBe(
      "",
    );
  });
});
