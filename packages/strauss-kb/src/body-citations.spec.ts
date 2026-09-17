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

  test("a record that cites nothing cites nothing", () => {
    expect(cited("\n## Claim\n\nNo links here.\n")).toEqual([]);
  });
});
