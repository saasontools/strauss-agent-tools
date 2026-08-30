import { describe, expect, it } from "vitest";

import { renderOutput } from "../render.js";
import type { RunResult } from "../schema.js";

const success: RunResult = {
  ok: true,
  jobId: "job-1",
  sessionId: "session-1",
  cwd: "/repo",
  result: "Reviewed verbatim.",
  usage: { turns: 2, costUsd: 0.2, durationMs: 1_500, model: "opus" },
  warnings: [{ code: "W_DIRTY_TREE", message: "dirty", hint: "isolate" }],
};

describe("output renderers", () => {
  it("renders JSON as exactly one parseable line", () => {
    const rendered = renderOutput(success, "json");
    expect(rendered.stderr).toBe("");
    expect(rendered.stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(rendered.stdout).jobId).toBe("job-1");
  });

  it("keeps markdown success sections in the contract order", () => {
    const markdown = renderOutput(success, "markdown").stdout;
    expect(markdown.indexOf("## Result")).toBeLessThan(
      markdown.indexOf("## Warnings"),
    );
    expect(markdown.indexOf("## Warnings")).toBeLessThan(
      markdown.indexOf("## Run"),
    );
    expect(markdown).toContain("claude --resume session-1");
  });

  it("uses Error, Warnings, Run order for failures", () => {
    const failed: RunResult = {
      ...success,
      ok: false,
      result: undefined,
      error: {
        code: "E_AUTH",
        message: "No auth",
        hint: "Log in",
        retryable: false,
        attempts: 1,
      },
    };
    const markdown = renderOutput(failed, "markdown").stdout;
    expect(markdown.indexOf("## Error")).toBeLessThan(
      markdown.indexOf("## Warnings"),
    );
    expect(markdown.indexOf("## Warnings")).toBeLessThan(
      markdown.indexOf("## Run"),
    );
  });

  it("puts only result text on stdout in text mode", () => {
    const rendered = renderOutput(success, "text");
    expect(rendered.stdout).toBe("Reviewed verbatim.\n");
    expect(rendered.stderr).toContain("W_DIRTY_TREE");
  });
});
