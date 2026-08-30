import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The plugin directory is what users actually install, and it lives outside
 * this package — an installed plugin cannot import a globally installed
 * runner, so the two only meet here. The hooks are shell scripts spawned by
 * the runtime, so they are driven the same way rather than approximated.
 */
const pluginRoot = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../plugins/codex-claude-agent",
);

const readJson = (path: string) =>
  JSON.parse(readFileSync(join(pluginRoot, path), "utf8")) as Record<
    string,
    unknown
  >;

/** The hooks are bash; Windows gets no meaningful run of them. */
const onPosix = it.skipIf(process.platform === "win32");

function runHook(
  script: string,
  stdin: string,
  env: NodeJS.ProcessEnv = {},
  cwd = process.cwd(),
) {
  // Absolute interpreter: one case below empties PATH to hide the CLI, and
  // resolving bash through that same PATH would fail the spawn instead.
  const result = spawnSync("/bin/bash", [join(pluginRoot, "hooks", script)], {
    input: stdin,
    encoding: "utf8",
    cwd,
    env: { ...process.env, ...env },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe("plugin manifests", () => {
  it("ships the same manifest to every runtime that reads one", () => {
    const root = readJson("plugin.json");
    expect(readJson(".codex-plugin/plugin.json")).toEqual(root);
    expect(root).toMatchObject({
      name: "codex-claude-agent",
      skills: "./skills/",
    });
    // The drift check compares plugin manifests to each other; keeping the
    // plugin on the runner's version is what makes that comparison mean
    // something to someone who installs the two from different places.
    const pkg = JSON.parse(
      readFileSync(
        resolve(
          fileURLToPath(new URL(".", import.meta.url)),
          "../package.json",
        ),
        "utf8",
      ),
    ) as { version: string };
    expect(root.version).toBe(pkg.version);
  });

  it("wires the two hooks the runner depends on", () => {
    const hooks = readJson("hooks/hooks.json") as {
      hooks: Record<string, { hooks: { command: string }[] }[]>;
    };

    expect(Object.keys(hooks.hooks).sort()).toEqual([
      "SessionStart",
      "UserPromptSubmit",
    ]);
    for (const event of Object.values(hooks.hooks)) {
      for (const group of event) {
        for (const hook of group.hooks) {
          expect(hook.command).toContain("$PLUGIN_ROOT/hooks/");
        }
      }
    }
  });

  it("exposes the skill under the name the runtime invokes", () => {
    const skill = readFileSync(
      join(pluginRoot, "skills", "claude", "SKILL.md"),
      "utf8",
    );

    expect(skill).toMatch(/^---\nname: claude\n/);
    expect(skill).toContain("codex-claude-agent run");
  });
});

describe("SessionStart hook", () => {
  onPosix("records the session id for job ownership", () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-claude-agent-hook-"));
    try {
      const envFile = join(dir, "env");
      writeFileSync(envFile, "");
      const result = runHook(
        "session-start.sh",
        JSON.stringify({ session_id: "abc-123" }),
        { CLAUDE_ENV_FILE: envFile, CODEX_CLAUDE_AGENT_NESTED: "" },
      );

      expect(result.status).toBe(0);
      expect(readFileSync(envFile, "utf8")).toContain(
        "CODEX_CLAUDE_AGENT_SESSION_ID=abc-123",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  onPosix("writes nothing for a nested run or a session-less payload", () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-claude-agent-hook-"));
    try {
      const envFile = join(dir, "env");
      writeFileSync(envFile, "");

      // A Claude session the runner itself started must not re-enter the
      // plugin and claim ownership of the outer session's jobs.
      expect(
        runHook("session-start.sh", JSON.stringify({ session_id: "abc" }), {
          CLAUDE_ENV_FILE: envFile,
          CODEX_CLAUDE_AGENT_NESTED: "1",
        }).status,
      ).toBe(0);
      expect(
        runHook("session-start.sh", "not json", {
          CLAUDE_ENV_FILE: envFile,
          CODEX_CLAUDE_AGENT_NESTED: "",
        }).status,
      ).toBe(0);
      expect(readFileSync(envFile, "utf8")).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("UserPromptSubmit hook", () => {
  onPosix("says nothing when the runner is not installed", () => {
    // It runs on every prompt. A machine without the CLI has to be silent,
    // not noisy once per turn.
    const result = runHook("unread-result.sh", "", {
      PATH: "/nonexistent",
      CODEX_CLAUDE_AGENT_NESTED: "",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  onPosix("reports a finished job through the installed CLI", () => {
    const bin = mkdtempSync(join(tmpdir(), "codex-claude-agent-bin-"));
    try {
      const shim = join(bin, "codex-claude-agent");
      writeFileSync(shim, '#!/bin/sh\necho "ARGS:$*"\n', { mode: 0o755 });

      const result = runHook("unread-result.sh", "", {
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        CODEX_CLAUDE_AGENT_NESTED: "",
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("ARGS:hook unread");
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
  });

  onPosix("stays out of a nested run", () => {
    const result = runHook("unread-result.sh", "", {
      CODEX_CLAUDE_AGENT_NESTED: "1",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });
});
