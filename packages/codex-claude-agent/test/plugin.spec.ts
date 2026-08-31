import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { stateRoot } from "../src/state.js";

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

  it("documents the flag rules a caller would otherwise guess wrong", () => {
    // From a real Codex session: it wrote `--timeout 1800000` and worked out
    // the unit by hand, and hit the worktree-path requirement as a failed run.
    // Both are in the CLI already; the skill just never said so.
    const skill = readFileSync(
      join(pluginRoot, "skills", "claude", "SKILL.md"),
      "utf8",
    );

    expect(skill).toContain("--timeout 30m");
    expect(skill).toMatch(/bare number is milliseconds/i);
    expect(skill).toMatch(/defaults to 15m/);
    expect(skill).toMatch(/`existing` requires `--worktree-path`/);
    // No single example may re-state --cwd as its worktree path: that is the
    // redundant shape the field report arrived in, and an example is the part
    // a model copies. Continuations are joined first so each command is one
    // line, otherwise a pair could be matched across two different examples.
    const commands = skill.replace(/\\\n\s*/g, " ").split("\n");
    for (const command of commands) {
      const cwd = /--cwd (\S+)/.exec(command)?.[1];
      const worktreePath = /--worktree-path (\S+)/.exec(command)?.[1];
      if (cwd && worktreePath) expect(worktreePath).not.toBe(cwd);
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
  /**
   * A shim directory holding fake `codex-claude-agent` / `npx` binaries that
   * echo their arguments. `/usr/bin` and `/bin` stay on PATH because the hook
   * shells out to `find`.
   */
  function shims(names: string[]): { dir: string; path: string } {
    const dir = mkdtempSync(join(tmpdir(), "codex-claude-agent-bin-"));
    for (const name of names) {
      writeFileSync(join(dir, name), `#!/bin/sh\necho "${name}:$*"\n`, {
        mode: 0o755,
      });
    }
    return { dir, path: `${dir}:/usr/bin:/bin` };
  }

  /** A state directory holding one job record, laid out as the runner does. */
  function stateWithJob(): string {
    const root = mkdtempSync(join(tmpdir(), "codex-claude-agent-state-"));
    const jobs = join(root, "repositories", "a".repeat(32), "jobs");
    mkdirSync(jobs, { recursive: true });
    writeFileSync(join(jobs, "claude-abc.json"), "{}");
    return root;
  }

  onPosix("stays silent when nothing has ever been run", () => {
    // It runs on every prompt. A session that never started a background job
    // must not pay for a process spawn once per turn — the directory test is
    // the whole cost.
    const { dir, path } = shims(["codex-claude-agent", "npx"]);
    const empty = mkdtempSync(join(tmpdir(), "codex-claude-agent-state-"));
    try {
      const result = runHook("unread-result.sh", "", {
        PATH: path,
        CODEX_CLAUDE_AGENT_STATE_DIR: empty,
        CODEX_CLAUDE_AGENT_NESTED: "",
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(empty, { recursive: true, force: true });
    }
  });

  onPosix("looks where the runner actually writes job records", () => {
    // The hook computes the state root in shell; the package computes it in
    // `stateRoot()`. Two implementations of one path is exactly the drift this
    // asserts against — including the XDG default, not just the env override.
    const home = mkdtempSync(join(tmpdir(), "codex-claude-agent-xdg-"));
    const { dir, path } = shims(["codex-claude-agent"]);
    try {
      const env = { XDG_STATE_HOME: home };
      const jobs = join(stateRoot(env), "repositories", "b".repeat(32), "jobs");
      mkdirSync(jobs, { recursive: true });
      writeFileSync(join(jobs, "claude-xyz.json"), "{}");

      const result = runHook("unread-result.sh", "", {
        ...env,
        PATH: path,
        CODEX_CLAUDE_AGENT_STATE_DIR: "",
        CODEX_CLAUDE_AGENT_NESTED: "",
      });

      expect(result.stdout.trim()).toBe("codex-claude-agent:hook unread");
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  });

  onPosix("prefers an installed CLI over fetching one", () => {
    const { dir, path } = shims(["codex-claude-agent", "npx"]);
    const state = stateWithJob();
    try {
      const result = runHook("unread-result.sh", "", {
        PATH: path,
        CODEX_CLAUDE_AGENT_STATE_DIR: state,
        CODEX_CLAUDE_AGENT_NESTED: "",
      });

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("codex-claude-agent:hook unread");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(state, { recursive: true, force: true });
    }
  });

  onPosix("stays silent rather than fetching the runner per prompt", () => {
    // Deliberately NOT the npx fallback the skill uses. Measured against the
    // published 0.1.0 with a warm cache, npx costs 7.5-9.0s per invocation
    // against 0.4s for an installed binary, and this hook runs every prompt.
    const { dir, path } = shims(["npx"]);
    const state = stateWithJob();
    try {
      const result = runHook("unread-result.sh", "", {
        PATH: path,
        CODEX_CLAUDE_AGENT_STATE_DIR: state,
        CODEX_CLAUDE_AGENT_NESTED: "",
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(state, { recursive: true, force: true });
    }
  });

  onPosix("swallows a failing runner instead of erroring every prompt", () => {
    // The notice is a courtesy on someone else's prompt. An unreachable
    // registry or a runner that errors must not put a failure in front of the
    // user once per turn — this hook exits 0 and says nothing.
    const { dir, path } = shims([]);
    const state = stateWithJob();
    try {
      writeFileSync(
        join(dir, "codex-claude-agent"),
        "#!/bin/sh\necho boom >&2\nexit 1\n",
        { mode: 0o755 },
      );

      const result = runHook("unread-result.sh", "", {
        PATH: path,
        CODEX_CLAUDE_AGENT_STATE_DIR: state,
        CODEX_CLAUDE_AGENT_NESTED: "",
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(state, { recursive: true, force: true });
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
