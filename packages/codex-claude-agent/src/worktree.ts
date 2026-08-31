import { execFile } from "node:child_process";
import { access, appendFile, mkdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { RunnerError } from "./errors.js";
import type { RunRequest, Warning } from "./schema.js";

const execFileAsync = promisify(execFile);

export interface ResolvedWorkspace {
  cwd: string;
  repoRoot?: string;
  sdkAdditionalDirectories: string[];
  warnings: Warning[];
  worktree?: {
    path: string;
    branch?: string;
    created: boolean;
    removed: boolean;
  };
  finish(success: boolean): Promise<Warning[]>;
}

async function git(
  cwd: string,
  args: string[],
  signal?: AbortSignal,
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      signal,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_EDITOR: ":" },
    });
    return stdout.trim();
  } catch (error) {
    throw new RunnerError("E_EXECUTION", `git ${args.join(" ")} failed`, {
      cause: error,
    });
  }
}

async function tryGit(
  cwd: string,
  args: string[],
  signal?: AbortSignal,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      signal,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_EDITOR: ":" },
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    const candidate = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return {
      ok: false,
      stdout: candidate.stdout?.trim() ?? "",
      stderr: candidate.stderr?.trim() ?? candidate.message ?? String(error),
    };
  }
}

export async function resolveGitRoot(
  cwd: string,
  signal?: AbortSignal,
): Promise<string> {
  const result = await tryGit(cwd, ["rev-parse", "--show-toplevel"], signal);
  if (!result.ok || !result.stdout) {
    throw new RunnerError(
      "E_NOT_GIT_REPO",
      `${cwd} is not inside a Git repository.`,
    );
  }
  return realpath(result.stdout);
}

async function ensureNotDetached(
  cwd: string,
  request: RunRequest,
  signal?: AbortSignal,
): Promise<void> {
  if (request.mode !== "edit" || request.allowDetached) return;
  const result = await tryGit(
    cwd,
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
    signal,
  );
  if (!result.ok) {
    throw new RunnerError(
      "E_DETACHED_HEAD",
      `Refusing edit mode on detached HEAD at ${cwd}.`,
    );
  }
}

async function registeredWorktrees(
  repoRoot: string,
  signal?: AbortSignal,
): Promise<Set<string>> {
  const output = await git(
    repoRoot,
    ["worktree", "list", "--porcelain"],
    signal,
  );
  const paths = output
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
  const resolved = await Promise.all(
    paths.map(async (entry) =>
      realpath(entry).catch(() => path.resolve(entry)),
    ),
  );
  return new Set(resolved);
}

export async function ensureCodexClaudeExcluded(
  repoRoot: string,
  signal?: AbortSignal,
): Promise<void> {
  const commonDirRaw = await git(
    repoRoot,
    ["rev-parse", "--git-common-dir"],
    signal,
  );
  const commonDir = path.resolve(repoRoot, commonDirRaw);
  const infoDir = path.join(commonDir, "info");
  const excludeFile = path.join(infoDir, "exclude");
  await mkdir(infoDir, { recursive: true });
  let content = "";
  try {
    content = await import("node:fs/promises").then(({ readFile }) =>
      readFile(excludeFile, "utf8"),
    );
  } catch {
    // Missing exclude file is normal.
  }
  if (!content.split(/\r?\n/).includes("/.codex-claude/")) {
    const prefix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
    await appendFile(excludeFile, `${prefix}/.codex-claude/\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
}

async function assertPathDoesNotExist(candidate: string): Promise<void> {
  try {
    await access(candidate);
    throw new RunnerError(
      "E_WORKTREE_EXISTS",
      `Worktree path already exists: ${candidate}`,
    );
  } catch (error) {
    if (error instanceof RunnerError) throw error;
  }
}

async function assertBranchDoesNotExist(
  repoRoot: string,
  branch: string,
  signal?: AbortSignal,
): Promise<void> {
  const exists = await tryGit(
    repoRoot,
    ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
    signal,
  );
  if (exists.ok) {
    throw new RunnerError(
      "E_BRANCH_EXISTS",
      `Branch already exists: ${branch}`,
    );
  }
}

async function createWorktree(
  repoRoot: string,
  targetPath: string,
  branch: string,
  ref: string,
  signal?: AbortSignal,
): Promise<void> {
  await assertPathDoesNotExist(targetPath);
  await assertBranchDoesNotExist(repoRoot, branch, signal);
  await mkdir(path.dirname(targetPath), { recursive: true });
  const result = await tryGit(
    repoRoot,
    ["worktree", "add", "-b", branch, targetPath, ref],
    signal,
  );
  if (!result.ok) {
    const resolvedTarget = await realpath(targetPath).catch(() =>
      path.resolve(targetPath),
    );
    const worktrees = await registeredWorktrees(repoRoot).catch(
      () => new Set<string>(),
    );
    let cleanupFailed = false;
    const createdWorktree = worktrees.has(resolvedTarget);
    if (createdWorktree) {
      const removed = await tryGit(repoRoot, [
        "worktree",
        "remove",
        "--force",
        targetPath,
      ]);
      cleanupFailed ||= !removed.ok;
    }
    if (createdWorktree) {
      const branchExists = await tryGit(repoRoot, [
        "show-ref",
        "--verify",
        "--quiet",
        `refs/heads/${branch}`,
      ]);
      if (branchExists.ok) {
        const deleted = await tryGit(repoRoot, ["branch", "-D", branch]);
        cleanupFailed ||= !deleted.ok;
      }
    }
    if (cleanupFailed) {
      throw new RunnerError(
        "E_EXECUTION",
        `Worktree creation failed and cleanup could not be verified. Inspect ${targetPath} and branch ${branch}.`,
        { cause: result.stderr },
      );
    }
    if (/already exists|already checked out/i.test(result.stderr)) {
      const code = result.stderr.includes(branch)
        ? "E_BRANCH_EXISTS"
        : "E_WORKTREE_EXISTS";
      throw new RunnerError(code, result.stderr);
    }
    throw new RunnerError(
      "E_EXECUTION",
      `Unable to create worktree ${targetPath}.`,
      { cause: result.stderr },
    );
  }
}

async function rollbackCreatedWorktree(
  repoRoot: string,
  targetPath: string,
  branch: string,
): Promise<void> {
  const removed = await tryGit(repoRoot, [
    "worktree",
    "remove",
    "--force",
    targetPath,
  ]);
  const deleted = await tryGit(repoRoot, ["branch", "-D", branch]);
  if (!removed.ok || !deleted.ok) {
    throw new RunnerError(
      "E_EXECUTION",
      `Unable to roll back worktree ${targetPath} and branch ${branch}.`,
      { cause: [removed.stderr, deleted.stderr].filter(Boolean).join("\n") },
    );
  }
}

export async function resolveWorkspace(
  request: RunRequest,
  jobId: string,
  signal?: AbortSignal,
  knownRepoRoot?: string,
): Promise<ResolvedWorkspace> {
  const inputCwd = await realpath(
    path.resolve(request.cwd ?? process.cwd()),
  ).catch((error) => {
    throw new RunnerError(
      "E_INVALID_REQUEST",
      `Working directory does not exist: ${request.cwd ?? process.cwd()}`,
      {
        cause: error,
      },
    );
  });
  await stat(inputCwd);
  const validatedExtras = await Promise.all(
    (request.additionalDirectories ?? []).map((entry) =>
      realpath(path.resolve(inputCwd, entry)),
    ),
  );

  if (request.noGit) {
    if (request.worktree.mode !== "none") {
      throw new RunnerError(
        "E_INVALID_REQUEST",
        "--no-git cannot be combined with a worktree mode.",
      );
    }
    return {
      cwd: inputCwd,
      sdkAdditionalDirectories: validatedExtras,
      warnings: [],
      finish: async () => [],
    };
  }

  const repoRoot = knownRepoRoot ?? (await resolveGitRoot(inputCwd, signal));
  const warnings: Warning[] = [];
  const ref = request.worktree.ref ?? "HEAD";
  let resolvedCwd = inputCwd;
  let worktree: ResolvedWorkspace["worktree"];
  let ephemeral = false;
  let createdForRollback: { targetPath: string; branch: string } | undefined;

  try {
    if (request.worktree.mode === "existing") {
      if (!request.worktree.path) {
        throw new RunnerError(
          "E_INVALID_REQUEST",
          "--worktree existing requires --worktree-path.",
        );
      }
      const requestedPath = request.worktree.path;
      const candidate = await realpath(
        path.resolve(inputCwd, requestedPath),
      ).catch(() => path.resolve(inputCwd, requestedPath));
      if (!(await registeredWorktrees(repoRoot, signal)).has(candidate)) {
        throw new RunnerError(
          "E_WORKTREE_NOT_FOUND",
          `Registered worktree not found: ${candidate}`,
        );
      }
      resolvedCwd = candidate;
      worktree = { path: candidate, created: false, removed: false };
    } else if (
      request.worktree.mode === "create" ||
      request.worktree.mode === "ephemeral"
    ) {
      ephemeral = request.worktree.mode === "ephemeral";
      const branch = request.worktree.branch ?? `codex-claude/${jobId}`;
      const targetPath = ephemeral
        ? path.join(repoRoot, ".codex-claude", "worktrees", jobId)
        : request.worktree.path
          ? path.resolve(inputCwd, request.worktree.path)
          : undefined;
      if (!targetPath) {
        throw new RunnerError(
          "E_INVALID_REQUEST",
          "--worktree create requires --worktree-path.",
        );
      }
      await createWorktree(repoRoot, targetPath, branch, ref, signal);
      createdForRollback = { targetPath, branch };
      resolvedCwd = await realpath(targetPath);
      worktree = { path: resolvedCwd, branch, created: true, removed: false };
    }

    await ensureNotDetached(resolvedCwd, request, signal);

    if (request.mode === "edit" && request.worktree.mode === "none") {
      const statusOutput = await git(
        resolvedCwd,
        ["status", "--porcelain"],
        signal,
      );
      if (statusOutput) {
        warnings.push({
          code: "W_DIRTY_TREE",
          message:
            "Edit mode is running in a worktree with uncommitted changes.",
          hint: "Use an ephemeral worktree to isolate Claude edits.",
        });
      }
    }

    const extras = [...validatedExtras];
    if (
      request.shareRoot &&
      resolvedCwd !== repoRoot &&
      !extras.includes(repoRoot)
    )
      extras.push(repoRoot);

    const resolvedWorkspace: ResolvedWorkspace = {
      cwd: resolvedCwd,
      repoRoot,
      sdkAdditionalDirectories: extras,
      warnings,
      worktree,
      finish: async (success) => {
        const cleanupWarnings: Warning[] = [];
        const shouldCleanup =
          ephemeral &&
          request.mode === "read-only" &&
          (request.worktree.cleanup ?? true) &&
          success;
        if (shouldCleanup && worktree?.created) {
          const remove = await tryGit(repoRoot, [
            "worktree",
            "remove",
            worktree.path,
          ]);
          if (!remove.ok) {
            cleanupWarnings.push({
              code: "W_WORKTREE_RETAINED",
              message: `Could not remove ephemeral worktree: ${worktree.path}`,
              hint: `Run git worktree remove ${JSON.stringify(worktree.path)} manually.`,
            });
          } else {
            const deleteBranch = await tryGit(repoRoot, [
              "branch",
              "-d",
              worktree.branch ?? "",
            ]);
            if (!deleteBranch.ok) {
              cleanupWarnings.push({
                code: "W_WORKTREE_RETAINED",
                message: `Worktree was removed but branch remains: ${worktree.branch ?? ""}`,
                hint: `Delete it with git branch -d ${JSON.stringify(worktree.branch ?? "")}.`,
              });
            }
            worktree.removed = true;
          }
        } else if (ephemeral && worktree) {
          cleanupWarnings.push({
            code: "W_WORKTREE_RETAINED",
            message: `${success ? "Edit" : "Failed"} run retained its ephemeral worktree: ${worktree.path}`,
            hint: "Inspect it, then remove it with git worktree remove.",
          });
        }
        return cleanupWarnings;
      },
    };
    createdForRollback = undefined;
    return resolvedWorkspace;
  } catch (error) {
    if (createdForRollback) {
      await rollbackCreatedWorktree(
        repoRoot,
        createdForRollback.targetPath,
        createdForRollback.branch,
      );
    }
    throw error;
  }
}
