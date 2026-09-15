import { localRevShapeIsSafe, runGit } from "@saasontools/git-guard";

export type Commit = { sha: string; paths: string[] };

/** Commits in `base..head`, oldest first, each with the paths it changed. Null when git could not answer. */
export async function commits(
  repoRoot: string,
  base: string,
  head: string = "HEAD",
): Promise<Commit[] | null> {
  if (!localRevShapeIsSafe(base) || !localRevShapeIsSafe(head)) return null;
  const result = await runGit(
    [
      "-C",
      repoRoot,
      "-c",
      "core.quotePath=false",
      "log",
      "--reverse",
      "--format=%x00%H",
      "--name-only",
      "--end-of-options",
      `${base}..${head}`,
      "--",
    ],
    { maxBytes: 16 * 1_048_576, timeoutMs: 20_000 },
  );
  if (!result.ok) return null;
  return result.stdout
    .split("\0")
    .filter((block) => block.trim())
    .map((block) => {
      const lines = block.split("\n").filter(Boolean);
      return { sha: lines[0] ?? "", paths: lines.slice(1) };
    });
}
