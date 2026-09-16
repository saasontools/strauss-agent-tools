import { runGit, type GitOptions } from "./run.js";
import { filePathIsSafe, localRevShapeIsSafe } from "./shape.js";

/**
 * A committed file's bytes at `rev`, or null. `cat-file blob` rather than
 * `show`: a path naming a directory must fail, not list a tree.
 */
export async function showAtRev(
  cwd: string,
  rev: string,
  file: string,
  limits: Pick<GitOptions, "timeoutMs" | "maxBytes"> = {},
): Promise<string | null> {
  if (!localRevShapeIsSafe(rev) || !filePathIsSafe(file)) return null;
  const path = file.replace(/^\.\//, "");
  const result = await runGit(
    ["cat-file", "blob", "--end-of-options", `${rev}:${path}`],
    { cwd, ...limits },
  );
  return result.ok ? result.stdout : null;
}
