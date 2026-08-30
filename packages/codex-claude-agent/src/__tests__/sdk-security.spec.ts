import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { RunnerError } from "../errors.js";
import {
  cleanEnvironment,
  commandAllowed,
  defaultAllowedTools,
  toolRequestAllowed,
  validateAgentDefinitions,
} from "../sdk.js";

describe("SDK security policy", () => {
  const originalEnvironment = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it("rejects shell control operators in read-only Git commands", () => {
    const tools = ["Bash(git diff:*)"];
    expect(commandAllowed("git diff --stat", tools)).toBe(true);
    expect(commandAllowed("git diff; echo stolen", tools)).toBe(false);
    expect(commandAllowed("git diff $(echo stolen)", tools)).toBe(false);
    expect(commandAllowed("git diff --output=/tmp/stolen", tools)).toBe(false);
  });

  it("passes Claude auth but strips unrelated host credentials", () => {
    process.env.ANTHROPIC_API_KEY = "claude-key";
    process.env.PWD = "/safe/project";
    process.env.AWS_SECRET_ACCESS_KEY = "aws-secret";
    process.env.GITHUB_TOKEN = "github-secret";
    const environment = cleanEnvironment();
    expect(environment.ANTHROPIC_API_KEY).toBe("claude-key");
    expect(environment.PWD).toBe("/safe/project");
    expect(environment.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(environment.GITHUB_TOKEN).toBeUndefined();
  });

  it("rejects subagent permissions and tools broader than the parent", () => {
    expect(() =>
      validateAgentDefinitions(
        {
          fixer: {
            description: "Fix code",
            prompt: "Fix it",
            tools: ["Write"],
            permissionMode: "acceptEdits",
          },
        },
        ["Read", "Glob", "Grep"],
        "read-only",
        false,
      ),
    ).toThrow(RunnerError);
  });

  it("passes bare Bash to the SDK when the parent grants a command pattern", () => {
    expect(
      validateAgentDefinitions(
        {
          reviewer: {
            description: "Review code",
            prompt: "Review it",
            tools: ["Bash"],
          },
        },
        ["Read", "Bash(git status:*)"],
        "read-only",
        false,
      ),
    ).toMatchObject({ reviewer: { tools: ["Bash"] } });
  });

  it("keeps file tools inside the explicitly allowed roots", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "claude-tools-"));
    const canonicalRoot = await realpath(root);
    expect(
      await toolRequestAllowed(
        "Read",
        { file_path: path.join(root, "src", "index.ts") },
        ["Read"],
        root,
        [canonicalRoot],
      ),
    ).toBe(true);
    expect(
      await toolRequestAllowed(
        "Read",
        { file_path: "/etc/passwd" },
        ["Read"],
        root,
        [canonicalRoot],
      ),
    ).toBe(false);
    expect(
      await toolRequestAllowed(
        "Bash",
        { command: "git status" },
        ["Bash(git status:*)"],
        root,
        [canonicalRoot],
        "/etc/passwd",
      ),
    ).toBe(false);
    expect(
      await toolRequestAllowed(
        "Read",
        { file_path: path.join(root, ".codex-claude", "jobs", "secret.json") },
        ["Read"],
        root,
        [canonicalRoot],
        undefined,
        [path.join(canonicalRoot, ".codex-claude", "jobs")],
      ),
    ).toBe(false);
  });

  it("does not grant unrestricted Bash by default in edit mode", () => {
    expect(defaultAllowedTools("edit")).not.toContain("Bash");
  });
});
