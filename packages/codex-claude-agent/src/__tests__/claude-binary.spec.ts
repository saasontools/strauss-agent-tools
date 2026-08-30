import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { CLAUDE_PATH_ENV, resolveClaudeExecutable } from "../claude-binary.js";

const directories: string[] = [];

/**
 * What a PATH lookup can actually find on this platform. Windows spawns need
 * an extension from PATHEXT — a bare `claude` there is the Git Bash shell
 * script, which `child_process.spawn` cannot execute — so the resolver only
 * looks for the extended names and a stub without one would never match.
 */
const EXECUTABLE = process.platform === "win32" ? "claude.exe" : "claude";

function binDir(options: { executable?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "codex-claude-agent-bin-"));
  directories.push(dir);
  const file = join(dir, EXECUTABLE);
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
    ).toBe(join(first, EXECUTABLE));
  });

  it("prefers an explicit override over PATH", () => {
    const onPath = binDir();
    const pinned = binDir();

    // An explicit path is taken as given on both platforms: it is spawned
    // directly rather than looked up through PATHEXT.
    expect(
      resolveClaudeExecutable({
        PATH: onPath,
        [CLAUDE_PATH_ENV]: join(pinned, EXECUTABLE),
      }),
    ).toBe(join(pinned, EXECUTABLE));
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
    ).toBe(join(dir, EXECUTABLE));
  });
});
