import { filePathIsSafe, runGit } from "@saasontools/git-guard";

/**
 * Paths under `dir` a range diff cannot see: untracked, staged, or changed in
 * the working tree, and not yet committed. Null when git could not answer.
 */
export async function uncommittedPaths(
  repoRoot: string,
  dir: string,
): Promise<string[] | null> {
  if (!filePathIsSafe(dir)) return null;
  const changed = (staged: boolean) =>
    runGit([
      "-C",
      repoRoot,
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
      ...(staged ? ["--cached"] : []),
      "--name-only",
      "-z",
      "--",
      dir,
    ]);
  const runs = await Promise.all([
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
    changed(false),
    changed(true),
  ]);
  if (runs.some((run) => !run.ok)) return null;
  return [...new Set(runs.flatMap((run) => run.stdout.split("\0")))].filter(
    Boolean,
  );
}
