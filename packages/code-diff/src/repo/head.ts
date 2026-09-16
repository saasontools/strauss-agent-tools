import { runGit } from "@saasontools/git-guard";

/** The sha `HEAD` names, or null outside a repository or before a first commit. */
export async function head(repoRoot: string): Promise<string | null> {
  const result = await runGit([
    "-C",
    repoRoot,
    "rev-parse",
    "--verify",
    "--quiet",
    "HEAD",
  ]);
  return (result.ok && result.stdout.trim()) || null;
}

/** The working tree's top level — where diff paths are relative to — or null. */
export async function toplevel(repoRoot: string): Promise<string | null> {
  const result = await runGit(["-C", repoRoot, "rev-parse", "--show-toplevel"]);
  return (result.ok && result.stdout.trim()) || null;
}
