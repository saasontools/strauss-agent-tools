import { runGit } from "@saasontools/git-guard";
import { rangeRevs } from "./diff.js";

export type ChangedFile = {
  path: string;
  /** Set on a rename: the path git matched it to. */
  oldPath?: string;
  /** git's status letter: `A`, `M`, `D`, `R`, `C`, `T`. */
  status: string;
};

/**
 * The files `base..head` changes, renames detected; `head` null means `base`
 * against the working tree. Null when git could not answer.
 */
export async function changedFiles(
  repoRoot: string,
  base: string,
  head: string | null,
): Promise<ChangedFile[] | null> {
  const revs = rangeRevs(base, head);
  if (revs === null) return null;
  const result = await runGit(
    [
      "-C",
      repoRoot,
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
      "--name-status",
      "-M",
      "-z",
      "--end-of-options",
      revs,
      "--",
    ],
    { maxBytes: 16 * 1_048_576, timeoutMs: 20_000 },
  );
  if (!result.ok) return null;

  // -z: status NUL path NUL, and a rename or copy carries two paths.
  const fields = result.stdout.split("\0");
  const files: ChangedFile[] = [];
  for (let at = 0; at < fields.length;) {
    const status = fields[at] ?? "";
    if (!status) break;
    const letter = status.charAt(0);
    if (letter === "R" || letter === "C") {
      const oldPath = fields[at + 1] ?? "";
      const path = fields[at + 2] ?? "";
      files.push({ path, oldPath, status: letter });
      at += 3;
    } else {
      files.push({ path: fields[at + 1] ?? "", status: letter });
      at += 2;
    }
  }
  return files.filter((file) => file.path);
}
