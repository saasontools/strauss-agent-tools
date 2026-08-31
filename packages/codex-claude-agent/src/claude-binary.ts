import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";

/**
 * Which `claude` the SDK spawns.
 *
 * The Agent SDK ships the Claude Code binary as a per-platform optional
 * dependency — a quarter of a gigabyte that duplicates the Claude Code the
 * user already has, and pins them to whatever build the SDK release carried.
 * This package installs without it (`--omit=optional`) and points the SDK at
 * the installed CLI instead, so the runner follows the user's own Claude Code
 * version rather than a second, invisible one.
 */
export const CLAUDE_PATH_ENV = "CODEX_CLAUDE_AGENT_CLAUDE_PATH";

/** Windows spawns need the extension; POSIX takes the bare name. */
function candidateNames(env: NodeJS.ProcessEnv): string[] {
  if (process.platform !== "win32") return ["claude"];
  const extensions = (env.PATHEXT ?? ".EXE;.CMD;.BAT")
    .split(";")
    .filter(Boolean);
  return extensions.map((extension) => `claude${extension.toLowerCase()}`);
}

function isExecutableFile(candidate: string): boolean {
  try {
    if (!statSync(candidate).isFile()) return false;
    // X_OK is meaningless on Windows — presence of the file is the test there.
    if (process.platform !== "win32") accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The absolute path to the Claude Code executable, or `undefined` when the
 * host has none. An explicit `CODEX_CLAUDE_AGENT_CLAUDE_PATH` wins over PATH
 * so a user with several installs can pin one.
 *
 * Absolute on purpose: the SDK subprocess runs with a reduced environment, and
 * a bare command name would have to be resolved again over whatever PATH
 * survived that reduction.
 */
export function resolveClaudeExecutable(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const override = env[CLAUDE_PATH_ENV]?.trim();
  if (override) {
    const resolved = path.resolve(override);
    return isExecutableFile(resolved) ? resolved : undefined;
  }

  const names = candidateNames(env);
  for (const entry of (env.PATH ?? "").split(path.delimiter)) {
    if (!entry) continue;
    for (const name of names) {
      const candidate = path.resolve(entry, name);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return undefined;
}
