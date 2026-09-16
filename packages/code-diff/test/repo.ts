import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type TempRepo = {
  root: string;
  git: (...args: string[]) => string;
  write: (path: string, text: string) => void;
  /** Stages everything and commits; returns the new sha. */
  commit: (message: string) => string;
  cleanup: () => void;
};

/**
 * Puts a `git` on PATH that fails with `message` when its argv holds
 * `trigger` and runs the real git otherwise. POSIX only. Returns the undo.
 */
export function fakeGit(trigger: string, message: string): () => void {
  const real = execFileSync("sh", ["-c", "command -v git"], {
    encoding: "utf8",
  }).trim();
  const dir = mkdtempSync(join(tmpdir(), "fake-git-"));
  writeFileSync(
    join(dir, "git"),
    `#!/bin/sh\ncase " $* " in *${trigger}*) echo "${message}" >&2; exit 128;; esac\nexec "${real}" "$@"\n`,
    { mode: 0o755 },
  );
  const saved = process.env["PATH"];
  process.env["PATH"] = `${dir}:${saved ?? ""}`;
  return () => {
    process.env["PATH"] = saved;
    rmSync(dir, { recursive: true, force: true });
  };
}

/** A throwaway repository whose setup never reads the host's git config. */
export function tempRepo(): TempRepo {
  const root = mkdtempSync(join(tmpdir(), "code-diff-repo-"));
  const configDir = mkdtempSync(join(tmpdir(), "code-diff-config-"));
  // An empty file, not the null device: git on Windows rejects the latter.
  const empty = join(configDir, "empty");
  writeFileSync(empty, "");
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: empty,
    GIT_CONFIG_SYSTEM: empty,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
  };
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env });
  git("init", "-q", "-b", "main");

  return {
    root,
    git,
    write: (path, text) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    },
    commit: (message) => {
      git("add", "-A");
      git("commit", "-qm", message);
      return git("rev-parse", "HEAD").trim();
    },
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(configDir, { recursive: true, force: true });
    },
  };
}
