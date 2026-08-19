import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The hook scripts are the enforcement layer and the most likely place for a
 * path-matching bug, so they are driven directly — spawned with crafted stdin,
 * exactly as the runtimes invoke them — rather than only testing the library
 * functions behind the same idea. They ship in the plugin directory, outside
 * this package, because installed plugins cannot import a globally installed
 * package; the monorepo is where the two can still be tested together.
 */
const pluginRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../plugins/strauss-kb",
);
const claudeBlock = join(pluginRoot, "hooks", "scripts", "block-kb-reads.mjs");
const agBlock = join(
  pluginRoot,
  "adapters",
  "antigravity",
  "scripts",
  "block-kb-reads.mjs",
);
const agInject = join(
  pluginRoot,
  "adapters",
  "antigravity",
  "scripts",
  "context-inject.mjs",
);

let workspace: string;

beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), "strauss-kb-hooks-"));
  mkdirSync(join(workspace, ".strauss", "kb"), { recursive: true });
  mkdirSync(join(workspace, "docs", "kb"), { recursive: true });
  writeFileSync(
    join(workspace, ".strauss", "kb-pins.json"),
    JSON.stringify({ pins: [{ path: "docs/kb", pinnedAt: "2026-08-19" }] }),
  );
});

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function run(script: string, stdin: string, env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(process.execPath, [script], {
    input: stdin,
    encoding: "utf8",
    cwd: workspace,
    env: { ...process.env, ...env },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

const read = (filePath: string) =>
  JSON.stringify({
    hook_event_name: "PreToolUse",
    tool_name: "Read",
    tool_input: { file_path: filePath },
    cwd: workspace,
  });

describe("Claude Code PreToolUse hook script", () => {
  it("blocks a Read inside the default base with the redirect on stderr", () => {
    const result = run(
      claudeBlock,
      read(join(workspace, ".strauss", "kb", "fact.cache.md")),
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("strauss-kb tools only");
    expect(result.stderr).toContain("supersession");
  });

  it("blocks relative, `..`-traversal, and pinned-base paths alike", () => {
    for (const target of [
      ".strauss/kb/INDEX.md",
      "src/../.strauss/kb/log.jsonl",
      join(workspace, "docs", "kb", "decision.cursor.md"),
      "docs/kb",
    ]) {
      expect(run(claudeBlock, read(target)).status).toBe(2);
    }
  });

  it("blocks Grep and Glob when their path points into a base", () => {
    const grep = JSON.stringify({
      tool_name: "Grep",
      tool_input: { pattern: "cursor", path: "docs/kb" },
      cwd: workspace,
    });

    expect(run(claudeBlock, grep).status).toBe(2);
  });

  it("allows everything outside the bases", () => {
    for (const target of [
      "src/index.ts",
      ".strauss/kb-pins.json",
      // A sibling whose name shares the prefix must not match the base.
      ".strauss/kb-notes/readme.md",
      join(workspace, "docs", "kb2", "x.md"),
    ]) {
      const result = run(claudeBlock, read(target));
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
    }
  });

  it("allows a Grep with no explicit path rather than over-blocking", () => {
    const grep = JSON.stringify({
      tool_name: "Grep",
      tool_input: { pattern: "cursor" },
      cwd: workspace,
    });

    expect(run(claudeBlock, grep).status).toBe(0);
  });

  it("fails open on malformed stdin and a malformed manifest", () => {
    expect(run(claudeBlock, "not json").status).toBe(0);

    const broken = mkdtempSync(join(tmpdir(), "strauss-kb-hooks-broken-"));
    try {
      mkdirSync(join(broken, ".strauss"), { recursive: true });
      writeFileSync(join(broken, ".strauss", "kb-pins.json"), "{ not json");
      // The pin list is unreadable, but the default base stays protected.
      const outside = JSON.stringify({
        tool_name: "Read",
        tool_input: { file_path: "src/app.ts" },
        cwd: broken,
      });
      const inside = JSON.stringify({
        tool_name: "Read",
        tool_input: { file_path: ".strauss/kb/fact.x.md" },
        cwd: broken,
      });
      expect(run(claudeBlock, outside).status).toBe(0);
      expect(run(claudeBlock, inside).status).toBe(2);
    } finally {
      rmSync(broken, { recursive: true, force: true });
    }
  });
});

describe("Antigravity PreToolUse hook script", () => {
  it("denies with a JSON decision, whatever the field is called", () => {
    const call = JSON.stringify({
      tool_name: "view_file",
      tool_input: { AbsolutePath: join(workspace, "docs", "kb", "a.md") },
      cwd: workspace,
    });

    const result = run(agBlock, call);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      decision: "deny",
      reason: expect.stringContaining("supersession") as unknown,
    });
  });

  it("answers {} for paths outside the bases and for malformed stdin", () => {
    const call = JSON.stringify({
      tool_name: "grep_search",
      tool_input: { query: "cursor", directory: "src" },
      cwd: workspace,
    });

    expect(JSON.parse(run(agBlock, call).stdout)).toEqual({});
    expect(JSON.parse(run(agBlock, "not json").stdout)).toEqual({});
  });
});

describe("Antigravity PreInvocation hook script", () => {
  function withShim(script: string): { status: number | null; stdout: string } {
    const bin = mkdtempSync(join(tmpdir(), "strauss-kb-shim-"));
    try {
      const shim = join(bin, "strauss-kb");
      writeFileSync(shim, `#!/bin/sh\n${script}\n`);
      chmodSync(shim, 0o755);
      return run(agInject, "", { PATH: `${bin}:${process.env.PATH}` });
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
  }

  it("wraps the context block as an ephemeral inject step", () => {
    const result = withShim('printf "## Knowledge bases (pinned)\\n\\nindex"');

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      injectSteps: [
        { ephemeralMessage: "## Knowledge bases (pinned)\n\nindex" },
      ],
    });
  });

  it("emits {} when there is nothing to say and when the CLI fails", () => {
    expect(JSON.parse(withShim("exit 0").stdout)).toEqual({});
    expect(JSON.parse(withShim("exit 1").stdout)).toEqual({});
    // CLI not installed at all.
    expect(
      JSON.parse(run(agInject, "", { PATH: "/nonexistent" }).stdout),
    ).toEqual({});
  });
});

describe("plugin config files parse", () => {
  // Runtimes without a validator get at least this: every manifest and hook
  // file the adapters ship is well-formed JSON with the shape its runtime
  // reads first.
  it("hooks.json, plugin manifests, and MCP configs are valid JSON", () => {
    const parse = (path: string) =>
      JSON.parse(readFileSync(join(pluginRoot, path), "utf8")) as Record<
        string,
        unknown
      >;

    const claudeHooks = parse("hooks/hooks.json") as {
      hooks: Record<string, { matcher?: string }[]>;
    };
    // The plugin wires SessionStart only. File-read blocking ships as a
    // script but stays opt-in — blocking reads on project paths is workspace
    // policy, so no PreToolUse entry here.
    expect(Object.keys(claudeHooks.hooks)).toEqual(["SessionStart"]);
    expect(
      claudeHooks.hooks.SessionStart!.map((group) => group.matcher),
    ).toEqual(["startup|resume|clear", "compact"]);

    expect(parse(".claude-plugin/plugin.json")).toMatchObject({
      name: "strauss-kb",
    });
    expect(parse(".mcp.json")).toMatchObject({
      mcpServers: { "strauss-kb": { command: "strauss-kb-mcp" } },
    });

    const codexHooks = parse("adapters/codex/hooks.json") as {
      hooks: Record<string, unknown[]>;
    };
    expect(codexHooks.hooks.SessionStart).toHaveLength(2);

    expect(parse("adapters/gemini/settings-hooks.json")).toMatchObject({
      hooks: { SessionStart: expect.any(Array) as unknown },
    });

    expect(parse("adapters/antigravity/plugin.json")).toMatchObject({
      name: "strauss-kb",
    });
    expect(parse("adapters/antigravity/mcp_config.json")).toMatchObject({
      mcpServers: { "strauss-kb": { command: "strauss-kb-mcp" } },
    });
    const agHooks = parse("adapters/antigravity/hooks.json") as Record<
      string,
      Record<string, unknown[]>
    >;
    // Same opt-in stance as the Claude Code plugin: injection wired,
    // blocking left to the workspace.
    expect(Object.keys(agHooks["strauss-kb-context"]!)).toEqual([
      "PreInvocation",
    ]);
  });
});
