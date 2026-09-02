import { describe, expect, test } from "vitest";
import {
  appendUnionMergeLine,
  hasMergeDeclaration,
  UNION_MERGE_LINE,
} from "./kb-gitattributes.js";

describe("appendUnionMergeLine", () => {
  test("adds no leading separator to an empty file", () => {
    expect(appendUnionMergeLine("")).toBe(`${UNION_MERGE_LINE}\n`);
  });

  // The function returns only the bytes to append, not the full file — a
  // caller does `existing + appendUnionMergeLine(existing)`.
  test("adds no separator when the existing content already ends in a newline", () => {
    expect(appendUnionMergeLine("* text=auto\n")).toBe(`${UNION_MERGE_LINE}\n`);
  });

  // The branch this guards: a hand-edited file with no trailing newline
  // would otherwise get the union-merge line tacked onto the end of the
  // file's last line instead of landing on a line of its own.
  test("adds a separating newline when the existing content does not end in one", () => {
    expect(appendUnionMergeLine("*.md text")).toBe(`\n${UNION_MERGE_LINE}\n`);
  });
});

describe("hasMergeDeclaration", () => {
  test("is false for an empty file", () => {
    expect(hasMergeDeclaration("")).toBe(false);
  });

  test("is false when the log file is mentioned but nothing sets merge", () => {
    expect(hasMergeDeclaration("log.jsonl text\n")).toBe(false);
  });

  test("is false for an unrelated pattern's merge attribute", () => {
    expect(hasMergeDeclaration("*.md merge=union\n")).toBe(false);
  });

  test("is true for the exact line this module writes", () => {
    expect(hasMergeDeclaration(`${UNION_MERGE_LINE}\n`)).toBe(true);
  });

  // Whitespace between the pattern and its attributes is not part of the
  // grammar being matched — any run of whitespace separates tokens the same
  // way in a real .gitattributes.
  test("is true across a tab or doubled spaces between tokens", () => {
    expect(hasMergeDeclaration("log.jsonl\tmerge=union\n")).toBe(true);
    expect(hasMergeDeclaration("log.jsonl  merge=union\n")).toBe(true);
  });

  test("is true when merge sits alongside other attributes, in either order", () => {
    expect(hasMergeDeclaration("log.jsonl text eol=lf merge=union\n")).toBe(
      true,
    );
    expect(hasMergeDeclaration("log.jsonl merge=union text\n")).toBe(true);
  });

  // A deliberate, different merge strategy is exactly the case this
  // function exists to recognize: the bundle already has an opinion, and
  // that opinion — not "union" specifically — is what must not be
  // overridden.
  test("is true for a merge strategy other than union", () => {
    expect(hasMergeDeclaration("log.jsonl merge=ours\n")).toBe(true);
  });

  test("is true for the plain `merge` and `-merge` attributes", () => {
    expect(hasMergeDeclaration("log.jsonl merge\n")).toBe(true);
    expect(hasMergeDeclaration("log.jsonl -merge\n")).toBe(true);
  });

  test("ignores comments and blank lines", () => {
    expect(hasMergeDeclaration("# log.jsonl merge=union\n\n*.md text\n")).toBe(
      false,
    );
  });

  test("is found on any line, not only the first", () => {
    expect(
      hasMergeDeclaration("* text=auto\n*.md text\nlog.jsonl merge=union\n"),
    ).toBe(true);
  });

  // A pattern that merely contains "log.jsonl" as a substring — a scoped
  // path, a glob — is not the same pattern as the bare filename this store
  // writes and reads at the bundle root.
  test("does not match a pattern that only contains the filename as a substring", () => {
    expect(hasMergeDeclaration("**/log.jsonl merge=union\n")).toBe(false);
    expect(hasMergeDeclaration("not-log.jsonl merge=union\n")).toBe(false);
  });
});
