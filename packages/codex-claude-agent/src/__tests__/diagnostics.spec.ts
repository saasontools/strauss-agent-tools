import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertDiagnostics,
  ensureFeatureFlags,
  runDiagnostics,
} from "../diagnostics.js";
import { repositoryStateDirectory } from "../state.js";

describe("runDiagnostics", () => {
  /** A host with Claude Code, and one without, without depending on either. */
  async function withStubbedEnvironment<T>(
    claudePath: string | undefined,
    body: (root: string) => Promise<T>,
  ): Promise<T> {
    const root = await mkdtemp(path.join(tmpdir(), "claude-diagnostics-"));
    const previous = {
      key: process.env.ANTHROPIC_API_KEY,
      claude: process.env.CODEX_CLAUDE_AGENT_CLAUDE_PATH,
      path: process.env.PATH,
    };
    process.env.ANTHROPIC_API_KEY = "test-only";
    // PATH is emptied so a developer machine with Claude Code installed and a
    // CI runner without one produce the same result.
    process.env.PATH = "";
    if (claudePath === undefined)
      delete process.env.CODEX_CLAUDE_AGENT_CLAUDE_PATH;
    else process.env.CODEX_CLAUDE_AGENT_CLAUDE_PATH = claudePath;
    try {
      return await body(root);
    } finally {
      if (previous.key === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previous.key;
      if (previous.claude === undefined)
        delete process.env.CODEX_CLAUDE_AGENT_CLAUDE_PATH;
      else process.env.CODEX_CLAUDE_AGENT_CLAUDE_PATH = previous.claude;
      process.env.PATH = previous.path;
    }
  }

  it("fails with a fix when the host has no Claude Code executable", async () => {
    // The SDK's own copy is an optional dependency this package does not
    // install, so a missing executable has to be caught here rather than
    // surfacing as a spawn failure from inside a run.
    const diagnostics = await withStubbedEnvironment(undefined, (root) =>
      runDiagnostics(root, { noCache: true }),
    );

    const check = diagnostics.checks.find((entry) => entry.name === "claude");
    expect(diagnostics.ok).toBe(false);
    expect(check?.ok).toBe(false);
    expect(check?.fix).toContain("CODEX_CLAUDE_AGENT_CLAUDE_PATH");
    expect(() => assertDiagnostics(diagnostics)).toThrowError(
      expect.objectContaining({ code: "E_CLAUDE_MISSING" }) as Error,
    );
  });

  it("reports the executable it will hand the SDK", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "claude-stub-"));
    const stub = path.join(dir, "claude");
    await writeFile(stub, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

    const diagnostics = await withStubbedEnvironment(stub, (root) =>
      runDiagnostics(root, { noCache: true }),
    );

    expect(
      diagnostics.checks.find((entry) => entry.name === "claude"),
    ).toMatchObject({ ok: true, detail: expect.stringContaining(stub) });
  });
});

describe("ensureFeatureFlags", () => {
  it("adds required feature gates and writable root idempotently", () => {
    const once = ensureFeatureFlags(
      "[features]\nhooks = false\n",
      "/repo/.codex-claude",
    );
    expect(once).toContain("hooks = true");
    expect(once).toContain("plugin_hooks = true");
    expect(once).toContain('writable_roots = ["/repo/.codex-claude"]');
    expect(ensureFeatureFlags(once, "/repo/.codex-claude")).toBe(once);
  });

  it("preserves existing writable roots", () => {
    const next = ensureFeatureFlags(
      '[sandbox_workspace_write]\nwritable_roots = ["/first"]\n',
      "/second",
    );
    expect(next).toContain('writable_roots = ["/first", "/second"]');
  });

  it("keeps escaped characters in an existing writable root", () => {
    // The root list is parsed with an escape-aware pattern; a Windows path
    // and an escaped quote both have to survive the round trip.
    const next = ensureFeatureFlags(
      '[sandbox_workspace_write]\nwritable_roots = ["C:\\\\repo\\\\.codex-claude", "/a\\"b"]\n',
      "/second",
    );

    expect(next).toContain('"C:\\\\repo\\\\.codex-claude"');
    expect(next).toContain('"/a\\"b"');
    expect(next).toContain('"/second"');
  });

  it("does not backtrack exponentially on a malformed root list", () => {
    // js/redos: with an ambiguous character class this input took
    // exponential time. Bounded here so a regression fails loudly.
    const hostile = `[sandbox_workspace_write]\nwritable_roots = ["${"\\!".repeat(60)}\n`;
    const started = process.hrtime.bigint();

    ensureFeatureFlags(hostile, "/second");

    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    expect(elapsedMs).toBeLessThan(1000);
  });

  it("refuses to write diagnostics through a symlink", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "claude-diagnostics-"));
    const state = repositoryStateDirectory(root);
    const target = path.join(root, "outside.txt");
    await mkdir(state);
    await writeFile(target, "unchanged");
    await symlink(target, path.join(state, "diagnostics.json"));
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-only";
    try {
      await expect(runDiagnostics(root, { noCache: true })).rejects.toThrow(
        "symlinked diagnostics file",
      );
      await expect(readFile(target, "utf8")).resolves.toBe("unchanged");
    } finally {
      if (previous === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previous;
    }
  });
});
