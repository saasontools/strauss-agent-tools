import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { CLAUDE_PATH_ENV, resolveClaudeExecutable } from "../claude-binary.js";

const directories: string[] = [];

function binDir(options: { executable?: boolean; name?: string } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "codex-claude-agent-bin-"));
  directories.push(dir);
  const file = join(dir, options.name ?? "claude");
  writeFileSync(file, "#!/bin/sh\nexit 0\n");
  chmodSync(file, options.executable === false ? 0o644 : 0o755);
  return dir;
}

afterEach(() => {
  for (const dir of directories.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveClaudeExecutable", () => {
  it("returns an absolute path for the first match on PATH", () => {
    const first = binDir();
    const second = binDir();

    expect(
      resolveClaudeExecutable({ PATH: [first, second].join(delimiter) }),
    ).toBe(join(first, "claude"));
  });

  it("prefers an explicit override over PATH", () => {
    const onPath = binDir();
    const pinned = binDir();

    expect(
      resolveClaudeExecutable({
        PATH: onPath,
        [CLAUDE_PATH_ENV]: join(pinned, "claude"),
      }),
    ).toBe(join(pinned, "claude"));
  });

  it("reports nothing rather than a path that cannot be spawned", () => {
    // An override pointing at nothing is a mistake worth surfacing as "no
    // executable" — diagnostics turns that into E_CLAUDE_MISSING with the fix
    // attached, which beats a spawn failure from inside the SDK.
    expect(
      resolveClaudeExecutable({ [CLAUDE_PATH_ENV]: "/nonexistent/claude" }),
    ).toBeUndefined();
    expect(resolveClaudeExecutable({ PATH: "" })).toBeUndefined();
    expect(resolveClaudeExecutable({})).toBeUndefined();
    // A directory named `claude`, and a non-executable file, are both misses.
    expect(
      resolveClaudeExecutable({ PATH: mkdtempSync(join(tmpdir(), "empty-")) }),
    ).toBeUndefined();
  });

  it.skipIf(process.platform === "win32")(
    "skips a file on PATH that is not executable",
    () => {
      const dir = binDir({ executable: false });

      expect(resolveClaudeExecutable({ PATH: dir })).toBeUndefined();
    },
  );

  it("ignores empty PATH entries instead of resolving against the cwd", () => {
    const dir = binDir();

    expect(
      resolveClaudeExecutable({ PATH: `${delimiter}${dir}${delimiter}` }),
    ).toBe(join(dir, "claude"));
  });
});
