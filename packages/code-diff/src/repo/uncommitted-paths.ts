import { filePathIsSafe, runGit } from "@saasontools/git-guard";

/**
 * Paths under `dir` a range diff cannot see: untracked, or changed in the
 * working tree and not yet committed. Null when git could not answer.
 */
export async function uncommittedPaths(
  repoRoot: string,
  dir: string,
): Promise<string[] | null> {
  if (!filePathIsSafe(dir)) return null;
  const [untracked, modified] = await Promise.all([
    runGit([
      "-C",
      repoRoot,
      "ls-files",
      "-z",
      "--others",
      "--exclude-standard",
      "--",
      dir,
    ]),
    runGit([
      "-C",
      repoRoot,
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
      "--name-only",
      "-z",
      "--",
      dir,
    ]),
  ]);
  if (!untracked.ok || !modified.ok) return null;
  return [
    ...new Set(
      [untracked.stdout, modified.stdout].flatMap((out) => out.split("\0")),
    ),
  ].filter(Boolean);
}
