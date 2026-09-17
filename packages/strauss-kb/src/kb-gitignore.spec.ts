import { describe, expect, test } from "vitest";
import {
  appendIgnoreBlock,
  BUNDLE_IGNORE_BLOCK,
  ignoreBlockState,
  STRAUSS_IGNORE_BLOCK,
} from "./kb-gitignore.js";

const BUNDLE = [
  "# BEGIN strauss-kb",
  "# Derived, rebuilt from the records beside it.",
  "/.index.sqlite*",
  "# END strauss-kb",
  "",
].join("\n");

describe("the blocks themselves", () => {
  test("carry their markers and an anchored pattern", () => {
    expect(BUNDLE_IGNORE_BLOCK.text).toBe(BUNDLE);
    expect(STRAUSS_IGNORE_BLOCK.text).toContain("/kb-pins.local.json");
  });

  // The markers are what makes a later rule a revision rather than a second
  // append, so they have to be found in a file that has drifted around them.
  test("are found in a file that has grown around them", () => {
    const grown = `*.tmp\n${BUNDLE}scratch/\n`;

    expect(ignoreBlockState(grown, BUNDLE_IGNORE_BLOCK)).toBe("present");
  });
});

describe("ignoreBlockState", () => {
  test("is missing for an empty file, present once written", () => {
    expect(ignoreBlockState("", BUNDLE_IGNORE_BLOCK)).toBe("missing");
    expect(ignoreBlockState(BUNDLE, BUNDLE_IGNORE_BLOCK)).toBe("present");
  });

  // git resolves repeated matches by last one wins, so writing the block over
  // a `!` line would overrule a deliberate choice to track the file.
  test("reads a literal negation of any covered file, sidecars included", () => {
    for (const line of [
      "!.index.sqlite\n",
      "!/.index.sqlite\n",
      "!.index.sqlite-wal\n",
      "*.tmp\n!.index.sqlite-shm\n",
    ]) {
      expect(ignoreBlockState(line, BUNDLE_IGNORE_BLOCK)).toBe("unignored");
    }
  });

  // A glob in a negation is not read: reading it would mean taking on git's
  // matching semantics, which is the whole cost this design refuses to pay.
  // The block is written, and git's last-one-wins settles it our way.
  test("does not read a glob negation, and says so by writing the block", () => {
    expect(ignoreBlockState("!*.sqlite*\n", BUNDLE_IGNORE_BLOCK)).toBe(
      "missing",
    );
  });

  // The committed manifest must stay trackable, and it is not a covered name.
  test("the pins block is not negated by a rule about the shared manifest", () => {
    expect(ignoreBlockState("!kb-pins.json\n", STRAUSS_IGNORE_BLOCK)).toBe(
      "missing",
    );
    expect(
      ignoreBlockState("!kb-pins.local.json\n", STRAUSS_IGNORE_BLOCK),
    ).toBe("unignored");
  });
});

describe("appendIgnoreBlock", () => {
  test("adds no leading separator to an empty file", () => {
    expect(appendIgnoreBlock("", BUNDLE_IGNORE_BLOCK)).toBe(BUNDLE);
  });

  test("adds no separator when the existing content ends in a newline", () => {
    expect(appendIgnoreBlock("*.tmp\n", BUNDLE_IGNORE_BLOCK)).toBe(BUNDLE);
  });

  test("adds a separating newline when the existing content does not end in one", () => {
    expect(appendIgnoreBlock("*.tmp", BUNDLE_IGNORE_BLOCK)).toBe(`\n${BUNDLE}`);
  });

  test("appends nothing when the block is already there", () => {
    expect(appendIgnoreBlock(BUNDLE, BUNDLE_IGNORE_BLOCK)).toBe("");
  });

  test("appends nothing over a negation", () => {
    expect(appendIgnoreBlock("!.index.sqlite-wal\n", BUNDLE_IGNORE_BLOCK)).toBe(
      "",
    );
  });

  // A pattern of the reader's own that already covers the files gets a second,
  // overlapping rule. git resolves it silently — the git suite pins that.
  test("writes the block beside an equivalent rule of the reader's own", () => {
    expect(appendIgnoreBlock("*.sqlite*\n", BUNDLE_IGNORE_BLOCK)).toBe(BUNDLE);
  });
});
