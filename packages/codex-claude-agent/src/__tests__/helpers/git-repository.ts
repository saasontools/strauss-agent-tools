import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * A throwaway repository with one commit on `main`. The worktree and job
 * suites need a real Git checkout — worktree creation, ref resolution, and
 * `info/exclude` writes are the behavior under test, not something a mock
 * would exercise.
 */
export async function createGitRepositoryFixture(
  prefix = "codex-claude-agent-git-fixture-",
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  execFileSync("git", ["init", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], {
    cwd: root,
  });
  execFileSync("git", ["config", "user.name", "Runner Test"], { cwd: root });
  await writeFile(path.join(root, "README.md"), "# test\n");
  execFileSync("git", ["add", "README.md"], { cwd: root });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: root });
  return root;
}
