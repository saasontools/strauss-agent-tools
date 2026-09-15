import { describe, expect, test } from "vitest";
import {
  appendGitattributesLines,
  GITATTRIBUTES_BLOCK,
  hasMergeDeclaration,
  missingGitattributesLines,
  UNION_MERGE_LINE,
} from "./kb-gitattributes.js";

/** The file this store writes from nothing, spelled out rather than derived. */
const FRESH = [
  "log.jsonl text eol=lf merge=union linguist-generated=true",
  "INDEX.md linguist-generated=true",
  ".index.sqlite linguist-generated=true",
].join("\n");

describe("missingGitattributesLines", () => {
  test("declares the merge driver and marks every store-owned file generated", () => {
    expect(missingGitattributesLines("").join("\n")).toBe(FRESH);
    expect(GITATTRIBUTES_BLOCK).toBe(`${FRESH}\n`);
  });

  test("asks for nothing once the block is present", () => {
    expect(missingGitattributesLines(GITATTRIBUTES_BLOCK)).toEqual([]);
  });

  // The upgrade path: a base written before `linguist-generated` existed
  // carries only the old merge line. It gains the three missing attributes
  // and keeps its merge strategy — including the log's, which the new
  // union-merge line would otherwise restate.
  test("adds only the missing attributes to a base carrying the old merge line", () => {
    expect(
      missingGitattributesLines("log.jsonl text eol=lf merge=union\n"),
    ).toEqual([
      "INDEX.md linguist-generated=true",
      "log.jsonl linguist-generated=true",
      ".index.sqlite linguist-generated=true",
    ]);
  });

  test("leaves a hand-set value for one file alone and adds the rest", () => {
    expect(missingGitattributesLines("INDEX.md -linguist-generated\n")).toEqual(
      [UNION_MERGE_LINE, ".index.sqlite linguist-generated=true"],
    );
  });
});

describe("appendGitattributesLines", () => {
  test("adds no leading separator to an empty file", () => {
    expect(appendGitattributesLines("")).toBe(GITATTRIBUTES_BLOCK);
  });

  // The function returns only the bytes to append, not the full file — a
  // caller does `existing + appendGitattributesLines(existing)`.
  test("adds no separator when the existing content already ends in a newline", () => {
    expect(appendGitattributesLines("* text=auto\n")).toBe(GITATTRIBUTES_BLOCK);
  });

  // The branch this guards: a hand-edited file with no trailing newline
  // would otherwise get the first line tacked onto the end of the file's
  // last line instead of landing on a line of its own.
  test("adds a separating newline when the existing content does not end in one", () => {
    expect(appendGitattributesLines("*.md text")).toBe(
      `\n${GITATTRIBUTES_BLOCK}`,
    );
  });

  test("returns nothing to append when every attribute is already declared", () => {
    expect(appendGitattributesLines(GITATTRIBUTES_BLOCK)).toBe("");
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
