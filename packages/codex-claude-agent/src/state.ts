import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export function stateRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(
    env.CODEX_CLAUDE_AGENT_STATE_DIR ??
      path.join(
        env.XDG_STATE_HOME ?? path.join(homedir(), ".local", "state"),
        "codex-claude-agent",
      ),
  );
}

export function repositoryStateDirectory(
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const canonicalRoot = (() => {
    try {
      return realpathSync.native(repoRoot);
    } catch {
      return path.resolve(repoRoot);
    }
  })();
  const repositoryId = createHash("sha256")
    .update(canonicalRoot)
    .digest("hex")
    .slice(0, 32);
  return path.join(stateRoot(env), "repositories", repositoryId);
}
