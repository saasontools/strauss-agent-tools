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
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stringifyMarkdownWithFrontmatter } from "../src/markdown.js";

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
const validateHook = join(
  pluginRoot,
  "hooks",
  "scripts",
  "validate-kb-bundle.mjs",
);
const denyGeneratedHook = join(
  pluginRoot,
  "hooks",
  "scripts",
  "deny-kb-generated-edits.mjs",
);
// The built CLI, exercised through a PATH shim exactly as the hook resolves
// it — a true integration test of the argv the hook constructs, not a
// restatement of what `validate-kb-bundle.mjs` is supposed to do.
const cliMain = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../dist/cli-main.js",
);
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

  it("protects local-layer and user-layer pins too", () => {
    writeFileSync(
      join(workspace, ".strauss", "kb-pins.local.json"),
      JSON.stringify({ pins: [{ path: "scratch/kb" }] }),
    );
    const userRoot = mkdtempSync(join(tmpdir(), "strauss-kb-user-hooks-"));
    try {
      mkdirSync(join(userRoot, ".strauss"), { recursive: true });
      writeFileSync(
        join(userRoot, ".strauss", "kb-pins.json"),
        JSON.stringify({ pins: [{ path: "conventions" }] }),
      );

      const env = { STRAUSS_KB_USER_ROOT: userRoot };
      expect(run(claudeBlock, read("scratch/kb/fact.a.md"), env).status).toBe(
        2,
      );
      expect(
        run(claudeBlock, read(join(userRoot, "conventions", "b.md")), env)
          .status,
      ).toBe(2);
    } finally {
      rmSync(join(workspace, ".strauss", "kb-pins.local.json"), {
        force: true,
      });
      rmSync(userRoot, { recursive: true, force: true });
    }
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

/**
 * A temp PATH prefix of fake executables, one per `name`, each execing a
 * node script with the given body. Mirrors the withShim pattern below for
 * the Antigravity inject test — a `.cmd` launcher on Windows, a shebang'd sh
 * script elsewhere — so the hook's own PATH-resolution logic is exercised,
 * not bypassed.
 */
function makeBinShims(bins: Record<string, string>): {
  path: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), "strauss-kb-bin-shims-"));
  for (const [name, body] of Object.entries(bins)) {
    writeFileSync(join(dir, `${name}.mjs`), body);
    if (process.platform === "win32") {
      writeFileSync(
        join(dir, `${name}.cmd`),
        `@echo off\r\nnode "%~dp0${name}.mjs" %*\r\n`,
      );
    } else {
      const shim = join(dir, name);
      writeFileSync(
        shim,
        `#!/bin/sh\nexec node "$(dirname "$0")/${name}.mjs" "$@"\n`,
      );
      chmodSync(shim, 0o755);
    }
  }
  return {
    path: dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// A `strauss-kb` shim that forwards straight to the real built CLI —
// exercises the hook's own argv against the real `validate` command.
const forwardToRealCli = `
import { spawnSync } from "node:child_process";
const r = spawnSync(process.execPath, [${JSON.stringify(cliMain)}, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
`;

// A fake `npx` that only understands the invocation this hook issues:
// [...flags, "strauss-kb", ...realArgs]. Everything after the literal
// "strauss-kb" token is forwarded to the real CLI, so the fallback path is
// proven without ever reaching the network.
const npxForwardingToRealCli = `
import { spawnSync } from "node:child_process";
const argv = process.argv.slice(2);
const at = argv.indexOf("strauss-kb");
const rest = at === -1 ? [] : argv.slice(at + 1);
const r = spawnSync(process.execPath, [${JSON.stringify(cliMain)}, ...rest], { stdio: "inherit" });
process.exit(r.status ?? 1);
`;

const postToolUse = (
  filePath: string,
  cwd: string,
  env: NodeJS.ProcessEnv = {},
) => ({
  stdin: JSON.stringify({
    hook_event_name: "PostToolUse",
    tool_name: "Edit",
    tool_input: { file_path: filePath },
    cwd,
  }),
  env,
});

describe("Claude Code PostToolUse validate hook script", () => {
  let badBundle: string;
  let goodBundle: string;

  beforeAll(() => {
    badBundle = mkdtempSync(join(tmpdir(), "strauss-kb-validate-bad-"));
    mkdirSync(join(badBundle, ".strauss", "kb"), { recursive: true });
    // Hand-broken: superseded but the replacement it names does not exist —
    // exactly the kind of drift a manual edit introduces that `kb_write` /
    // `kb_supersede` cannot.
    writeFileSync(
      join(badBundle, ".strauss", "kb", "fact.a.md"),
      stringifyMarkdownWithFrontmatter("body", {
        type: "fact",
        strauss_status: "superseded",
        strauss_superseded_by: "fact.missing",
      }),
    );

    goodBundle = mkdtempSync(join(tmpdir(), "strauss-kb-validate-good-"));
    mkdirSync(join(goodBundle, ".strauss", "kb"), { recursive: true });
    writeFileSync(
      join(goodBundle, ".strauss", "kb", "fact.b.md"),
      stringifyMarkdownWithFrontmatter("body", { type: "fact" }),
    );
  });

  afterAll(() => {
    rmSync(badBundle, { recursive: true, force: true });
    rmSync(goodBundle, { recursive: true, force: true });
  });

  it("surfaces validate's problems as additionalContext, via the real CLI on PATH", () => {
    const shims = makeBinShims({ "strauss-kb": forwardToRealCli });
    try {
      const { stdin, env } = postToolUse(
        join(badBundle, ".strauss", "kb", "fact.a.md"),
        badBundle,
      );
      const result = run(validateHook, stdin, {
        ...env,
        PATH: `${shims.path}${delimiter}${process.env.PATH}`,
      });

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout) as {
        hookSpecificOutput: {
          hookEventName: string;
          additionalContext: string;
        };
      };
      expect(parsed.hookSpecificOutput.hookEventName).toBe("PostToolUse");
      expect(parsed.hookSpecificOutput.additionalContext).toContain(
        "1 problem(s)",
      );
      expect(parsed.hookSpecificOutput.additionalContext).toContain("fact.a");
      expect(parsed.hookSpecificOutput.additionalContext).toContain(
        "superseded_by",
      );
    } finally {
      shims.cleanup();
    }
  });

  it("falls back to npx when strauss-kb isn't resolvable on PATH", () => {
    const shims = makeBinShims({ npx: npxForwardingToRealCli });
    try {
      const { stdin, env } = postToolUse(
        join(badBundle, ".strauss", "kb", "fact.a.md"),
        badBundle,
      );
      const result = run(validateHook, stdin, {
        ...env,
        PATH: `${shims.path}${delimiter}${process.env.PATH}`,
      });

      expect(result.status).toBe(0);
      expect(
        JSON.parse(result.stdout).hookSpecificOutput.additionalContext,
      ).toContain("1 problem(s)");
    } finally {
      shims.cleanup();
    }
  });

  it("prints nothing for a clean bundle", () => {
    const shims = makeBinShims({ "strauss-kb": forwardToRealCli });
    try {
      const { stdin, env } = postToolUse(
        join(goodBundle, ".strauss", "kb", "fact.b.md"),
        goodBundle,
      );
      const result = run(validateHook, stdin, {
        ...env,
        PATH: `${shims.path}${delimiter}${process.env.PATH}`,
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
    } finally {
      shims.cleanup();
    }
  });

  it("prints nothing for a bundle directory that does not exist yet", () => {
    const freshRoot = mkdtempSync(join(tmpdir(), "strauss-kb-validate-fresh-"));
    const shims = makeBinShims({ "strauss-kb": forwardToRealCli });
    try {
      const { stdin, env } = postToolUse(
        join(freshRoot, ".strauss", "kb", "fact.new.md"),
        freshRoot,
      );
      const result = run(validateHook, stdin, {
        ...env,
        PATH: `${shims.path}${delimiter}${process.env.PATH}`,
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
    } finally {
      shims.cleanup();
      rmSync(freshRoot, { recursive: true, force: true });
    }
  });

  it("exits before ever touching PATH for a path outside any bundle", () => {
    const { stdin, env } = postToolUse(
      join(badBundle, "src", "app.ts"),
      badBundle,
    );
    const result = run(validateHook, stdin, { ...env, PATH: "/nonexistent" });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("honors STRAUSS_KB_NO_VALIDATE_HOOK, without touching PATH either", () => {
    const { stdin, env } = postToolUse(
      join(badBundle, ".strauss", "kb", "fact.a.md"),
      badBundle,
      { STRAUSS_KB_NO_VALIDATE_HOOK: "1" },
    );
    const result = run(validateHook, stdin, { ...env, PATH: "/nonexistent" });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("fails open on malformed stdin", () => {
    const result = run(validateHook, "not json");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });
});

describe("Claude Code PreToolUse deny-generated-edits hook script", () => {
  const preToolUse = (filePath: string, toolName = "Write") =>
    JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: toolName,
      tool_input: { file_path: filePath },
      cwd: workspace,
    });

  it.each(["INDEX.md", "log.jsonl", ".index.sqlite"])(
    "denies a direct edit to %s inside a bundle",
    (name) => {
      const result = run(
        denyGeneratedHook,
        preToolUse(join(workspace, ".strauss", "kb", name)),
      );

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout) as {
        hookSpecificOutput: {
          hookEventName: string;
          permissionDecision: string;
          permissionDecisionReason: string;
        };
      };
      expect(parsed.hookSpecificOutput).toMatchObject({
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
      });
      expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain(
        name,
      );
    },
  );

  it("denies through MultiEdit too — the check is on the basename, not the tool", () => {
    const result = run(
      denyGeneratedHook,
      preToolUse(join(workspace, ".strauss", "kb", "INDEX.md"), "MultiEdit"),
    );

    expect(
      JSON.parse(result.stdout).hookSpecificOutput.permissionDecision,
    ).toBe("deny");
  });

  it("allows an ordinary record file in the same bundle", () => {
    const result = run(
      denyGeneratedHook,
      preToolUse(join(workspace, ".strauss", "kb", "fact.new.md")),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("allows a same-named file outside any bundle", () => {
    const result = run(denyGeneratedHook, preToolUse("INDEX.md"));

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("fails open on malformed stdin", () => {
    const result = run(denyGeneratedHook, "not json");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
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
  // The shim is a node script behind platform launchers — a `.cmd` on
  // Windows, a shebang'd sh script elsewhere — mirroring how npm actually
  // installs the CLI, which is exactly the resolution the inject script has
  // to get right on both platforms.
  function withShim(body: string): { status: number | null; stdout: string } {
    const bin = mkdtempSync(join(tmpdir(), "strauss-kb-shim-"));
    try {
      writeFileSync(join(bin, "shim.mjs"), body);
      if (process.platform === "win32") {
        writeFileSync(
          join(bin, "strauss-kb.cmd"),
          `@echo off\r\nnode "%~dp0shim.mjs" %*\r\n`,
        );
      } else {
        const shim = join(bin, "strauss-kb");
        writeFileSync(
          shim,
          `#!/bin/sh\nexec node "$(dirname "$0")/shim.mjs" "$@"\n`,
        );
        chmodSync(shim, 0o755);
      }
      return run(agInject, "", {
        PATH: `${bin}${delimiter}${process.env.PATH}`,
      });
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
  }

  it("wraps the context block as an ephemeral inject step", () => {
    const result = withShim(
      'process.stdout.write("## Knowledge bases (pinned)\\n\\nindex");',
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      injectSteps: [
        { ephemeralMessage: "## Knowledge bases (pinned)\n\nindex" },
      ],
    });
  });

  it("emits {} when there is nothing to say and when the CLI fails", () => {
    expect(JSON.parse(withShim("process.exit(0);").stdout)).toEqual({});
    expect(JSON.parse(withShim("process.exit(1);").stdout)).toEqual({});
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
    // SessionStart context injection, plus the two record-edit hooks (deny
    // direct edits to generated files, validate the bundle after the rest).
    // File-read blocking ships as a script but stays opt-in — blocking reads
    // on project paths is workspace policy — so no PreToolUse entry for
    // that one here.
    expect(Object.keys(claudeHooks.hooks)).toEqual([
      "SessionStart",
      "PreToolUse",
      "PostToolUse",
    ]);
    expect(
      claudeHooks.hooks.SessionStart!.map((group) => group.matcher),
    ).toEqual(["startup|resume|clear", "compact"]);
    expect(claudeHooks.hooks.PreToolUse!.map((group) => group.matcher)).toEqual(
      ["Write|Edit|MultiEdit"],
    );
    expect(
      claudeHooks.hooks.PostToolUse!.map((group) => group.matcher),
    ).toEqual(["Write|Edit|MultiEdit"]);

    expect(parse(".claude-plugin/plugin.json")).toMatchObject({
      name: "strauss-kb",
    });
    expect(parse(".mcp.json")).toMatchObject({
      mcpServers: {
        "strauss-kb": {
          // The published package, not whatever happens to be installed.
          command: "npx",
          args: expect.arrayContaining([
            "@saasontools/strauss-kb@0.x",
            "strauss-kb-mcp",
          ]),
        },
      },
    });

    const codexHooks = parse("adapters/codex/hooks.json") as {
      hooks: Record<string, unknown[]>;
    };
    expect(codexHooks.hooks.SessionStart).toHaveLength(2);

    expect(parse("adapters/antigravity/plugin.json")).toMatchObject({
      name: "strauss-kb",
    });
    expect(parse("adapters/antigravity/mcp_config.json")).toMatchObject({
      mcpServers: {
        "strauss-kb": {
          // The published package, not whatever happens to be installed.
          command: "npx",
          args: expect.arrayContaining([
            "@saasontools/strauss-kb@0.x",
            "strauss-kb-mcp",
          ]),
        },
      },
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
