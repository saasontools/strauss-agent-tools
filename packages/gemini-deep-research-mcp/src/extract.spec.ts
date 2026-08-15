import { describe, expect, it } from "vitest";
import {
  errorSummary,
  latestThought,
  reportText,
  urlCitations,
  usageSummary,
} from "./extract.js";
import { isTerminal, mayHaveReport } from "./types.js";
import type { InteractionLike } from "./types.js";

function interaction(overrides: Partial<InteractionLike>): InteractionLike {
  return { id: "v1_test", status: "completed", ...overrides };
}

describe("latestThought", () => {
  it("returns the newest thought summary text", () => {
    const result = latestThought(
      interaction({
        steps: [
          { type: "thought", summary: [{ type: "text", text: "older" }] },
          { type: "model_output", content: [{ type: "text", text: "x" }] },
          { type: "thought", summary: [{ type: "text", text: "newest" }] },
        ],
      }),
    );
    expect(result).toBe("newest");
  });

  it("returns undefined without thought steps or with empty summaries", () => {
    expect(latestThought(interaction({}))).toBeUndefined();
    expect(
      latestThought(interaction({ steps: [{ type: "thought", summary: [] }] })),
    ).toBeUndefined();
  });
});

describe("reportText", () => {
  it("prefers output_text", () => {
    expect(
      reportText(
        interaction({
          output_text: "the report",
          steps: [
            {
              type: "model_output",
              content: [{ type: "text", text: "ignored" }],
            },
          ],
        }),
      ),
    ).toBe("the report");
  });

  it("falls back to walking model_output steps", () => {
    expect(
      reportText(
        interaction({
          steps: [
            { type: "thought", summary: [{ type: "text", text: "thinking" }] },
            {
              type: "model_output",
              content: [{ type: "text", text: "part one. " }],
            },
            {
              type: "model_output",
              content: [{ type: "text", text: "part two." }],
            },
          ],
        }),
      ),
    ).toBe("part one. \npart two.");
  });

  it("returns undefined when there is no output at all", () => {
    expect(reportText(interaction({}))).toBeUndefined();
    expect(reportText(interaction({ output_text: "  " }))).toBeUndefined();
  });
});

describe("urlCitations", () => {
  it("extracts URL citations, dedupes, and tolerates other annotation types", () => {
    const result = urlCitations(
      interaction({
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "text",
                text: "a",
                annotations: [
                  {
                    type: "url_citation",
                    url: "https://a.example",
                    title: "A",
                  },
                  { type: "file_citation" },
                  { type: "word_info" },
                  { type: "url_citation", url: "https://a.example" },
                  { type: "url_citation", url: "https://b.example" },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(result).toEqual([
      { url: "https://a.example", title: "A" },
      { url: "https://b.example" },
    ]);
  });
});

describe("usageSummary", () => {
  it("formats token counts and grounding usage", () => {
    const line = usageSummary(
      interaction({
        usage: {
          total_input_tokens: 120,
          total_output_tokens: 34_000,
          total_thought_tokens: 9_000,
          grounding_tool_count: [{ google_search: 42 }],
        },
      }),
    );
    expect(line).toContain("input tokens: 120");
    expect(line).toContain("output tokens: 34000");
    expect(line).toContain("thought tokens: 9000");
    expect(line).toContain("grounding");
  });

  it("returns undefined without usage", () => {
    expect(usageSummary(interaction({}))).toBeUndefined();
  });
});

describe("errorSummary", () => {
  it("joins codes and messages", () => {
    expect(
      errorSummary(
        interaction({
          errors: [{ code: "internal", message: "boom" }, { message: "again" }],
        }),
      ),
    ).toBe("internal: boom; again");
    expect(errorSummary(interaction({}))).toBeUndefined();
  });
});

describe("status classification", () => {
  it("treats incomplete and budget_exceeded as terminal-but-fetchable", () => {
    for (const status of ["incomplete", "budget_exceeded", "completed"]) {
      expect(isTerminal(status), status).toBe(true);
      expect(mayHaveReport(status), status).toBe(true);
    }
    for (const status of ["failed", "cancelled"]) {
      expect(isTerminal(status), status).toBe(true);
      expect(mayHaveReport(status), status).toBe(false);
    }
    for (const status of ["queued", "in_progress", "requires_action"]) {
      expect(isTerminal(status), status).toBe(false);
    }
  });
});
