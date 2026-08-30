import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ensureFeatureFlags, runDiagnostics } from "../diagnostics.js";
import { repositoryStateDirectory } from "../state.js";

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
