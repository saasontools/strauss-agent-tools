import { describe, expect, test } from "vitest";
import { bodyCitations } from "./body-citations.js";
import type { KbRecord } from "./kb-record.schema.js";

/**
 * The one body read left in the package. `validate` uses it to say a record's
 * prose and its `strauss_links` have come apart, and `mirror-links` uses it to
 * put them back together — so a citation it invents is an edge nobody wrote.
 */

function record(conceptId: string, body: string): KbRecord {
  const [type] = conceptId.split(".");
  return {
    conceptId,
    frontmatter: {
      type: type as string,
      title: conceptId,
      strauss_status: "accepted",
    } as KbRecord["frontmatter"],
    body,
  };
}

const cited = (body: string) => [...bodyCitations(record("decision.a", body))];

describe("bodyCitations", () => {
  // A record that explains the house style shows a citation; it does not make
  // one. Both new consumers act on what this parser returns.
  test("a link inside a fence or a code span is an example, not a citation", () => {
    const from = record(
      "decision.house-style",
      [
        "",
        "## Claim",
        "",
        "Cite like this:",
        "",
        "```markdown",
        "Relates to [decision.fenced](decision.fenced.md).",
        "```",
        "",
        "Inline, `[decision.inline](decision.inline.md)` is an example too.",
        "",
        "Relates to [decision.real](decision.real.md).",
        "",
      ].join("\n"),
    );

    expect([...bodyCitations(from)]).toEqual(["decision.real"]);
  });

  // The reviewer's own record proved the first fix wrong: a longer run in the
  // middle of a line re-paired every span after it.
  test("a longer backtick run does not re-pair the spans after it", () => {
    const from = record(
      "decision.house-style",
      [
        "",
        "## Claim",
        "",
        "`](<concept-id>.md)` inside a ```markdown block is a reference, so",
        "`Relates to [decision.quoted](decision.quoted.md).` is an example.",
        "",
        "Relates to [decision.real](decision.real.md).",
        "",
      ].join("\n"),
    );

    expect([...bodyCitations(from)]).toEqual(["decision.real"]);
  });

  test("an unclosed fence runs to the end of the record", () => {
    const from = record(
      "decision.truncated",
      [
        "",
        "## Claim",
        "",
        "~~~",
        "Relates to [decision.fenced](decision.fenced.md).",
        "",
      ].join("\n"),
    );

    expect([...bodyCitations(from)]).toEqual([]);
  });

  // The correctness reviewer's repro: both are code by CommonMark, and
  // `mirror-links` would have written each as a `related_to` nobody stated.
  test("a fence under a list item and an indented block are code", () => {
    expect(
      cited(
        [
          "- Cite like this:",
          "",
          "      ```md",
          "      Relates to [fact.fenced](fact.fenced.md).",
          "      ```",
          "",
          "Paragraph.",
          "",
          "    Relates to [fact.indented](fact.indented.md).",
          "",
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  // The other direction, and the one a hand-rolled rule got wrong: indentation
  // inside a list is continuation text, and dropping it loses a real edge.
  test("a citation in a nested list item is still a citation", () => {
    expect(
      cited(
        [
          "- Outer",
          "",
          "    - Inner, relating to [fact.nested](fact.nested.md).",
          "",
          "    Continuation of the outer item: [fact.continued](fact.continued.md).",
          "",
        ].join("\n"),
      ),
    ).toEqual(["fact.nested", "fact.continued"]);
  });

  test("only a link to a record file counts", () => {
    expect(
      cited(
        "[docs](https://example.test/a.md), [readme](README.md), [x](fact.a.md#part), [ok](fact.ok.md).",
      ),
    ).toEqual(["fact.ok"]);
  });

  // Nesting depth is the author's to choose. A walk that recursed per level
  // let one record overflow the stack of validate, doctor and mirror-links.
  test("twenty thousand levels of nesting are read, not overflowed", () => {
    expect(cited(`${">".repeat(20000)} [fact.b](fact.b.md)`)).toEqual([
      "fact.b",
    ]);
  });

  // Nested list markers cost the parser quadratic time on one line: 8,000
  // took nine seconds. No real record nests that deep, so it is refused.
  test("a line nested past the limit is refused, by name, before parsing", () => {
    const started = Date.now();
    expect(() =>
      bodyCitations(
        record("fact.hostile", `${"* ".repeat(8000)}[x](fact.b.md)`),
      ),
    ).toThrow(/fact\.hostile: .*more than 64 nested lists/);
    expect(Date.now() - started).toBeLessThan(500);
  });

  test("ordinary nesting is read", () => {
    expect(cited(`${"- ".repeat(10)}[x](fact.b.md)`)).toEqual(["fact.b"]);
    expect(cited(`${"1. ".repeat(10)}[x](fact.b.md)`)).toEqual(["fact.b"]);
  });

  test("a record that cites nothing cites nothing", () => {
    expect(cited("\n## Claim\n\nNo links here.\n")).toEqual([]);
  });
});
