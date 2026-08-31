import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The published artifact, run the way npm actually runs it.
 *
 * 0.1.0 and 0.1.1 both shipped a CLI that did nothing when invoked through the
 * bin symlink npm creates — it exited 0 in silence. Every in-process test
 * passed, because they import `main` and call it directly; the failure lived
 * entirely in the entry guard, which only the built file has. So this suite
 * spawns `dist/cli.js` rather than importing it, and reaches it the way an
 * install does.
 */
const distCli = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../dist/cli.js",
);

function run(command: string, args: string[] = []) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("the built CLI as an install exposes it", () => {
  it("runs when reached through a bin symlink", () => {
    // npm links `node_modules/.bin/<name>` at the entry file, so argv[1] is
    // the link and import.meta.url is its target. Comparing those two without
    // resolving them is what made `npm i -g` and `npx` silent no-ops.
    const dir = mkdtempSync(join(tmpdir(), "codex-claude-agent-bin-"));
    try {
      const link = join(dir, "codex-claude-agent");
      symlinkSync(distCli, link);

      const result = run(link);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("codex-claude-agent — delegate");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs when invoked directly", () => {
    const result = run(process.execPath, [distCli]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage:");
  });

  it("still answers a subcommand through the symlink", () => {
    // Not just the help path: the guard gates every command, so a subcommand
    // has to prove it reaches the dispatch too.
    const dir = mkdtempSync(join(tmpdir(), "codex-claude-agent-bin-"));
    try {
      const link = join(dir, "codex-claude-agent");
      symlinkSync(distCli, link);

      const result = run(link, ["run", "--timeout", "1800", "--cwd", dir, "x"]);

      expect(result.stderr).toContain("Bare numbers are milliseconds");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
