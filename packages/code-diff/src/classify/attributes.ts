import { checkAttr, localRevShapeIsSafe, runGit } from "@saasontools/git-guard";
import type { Verdict } from "./model.js";
import { attributeVerdict, CLASS_ATTRIBUTES } from "./rules.js";

export type Attributes = {
  /** A verdict per path that carries a class attribute. */
  classes: Map<string, Verdict>;
  /** Some `.gitattributes` names a class attribute, so the default path table is off. */
  repoDeclares: boolean;
  /** Read at `base`. False: the working tree answered, and a branch could have edited it. */
  pinned: boolean;
};

/**
 * `.gitattributes` at `base`, one batched `check-attr` for every path, so a
 * change cannot reclassify its own files. `base` null reads the working tree.
 * `paths` are relative to `repoRoot`, which `classifyFiles` puts at the top.
 */
export async function readAttributes(
  repoRoot: string,
  base: string | null,
  paths: readonly string[],
): Promise<Attributes> {
  const [{ attrs, pinned }, repoDeclares] = await Promise.all([
    checkAttr(repoRoot, base, paths, CLASS_ATTRIBUTES),
    declaresClasses(repoRoot, base),
  ]);
  const classes = new Map<string, Verdict>();
  for (const [path, values] of attrs) {
    const verdict = attributeVerdict(values);
    if (verdict) classes.set(path, verdict);
  }
  return { classes, repoDeclares, pinned };
}

/**
 * Whether any `.gitattributes` at `base` mentions a class attribute. A mention
 * in a comment counts too: it turns the path table off, the safe direction.
 */
async function declaresClasses(
  repoRoot: string,
  base: string | null,
): Promise<boolean> {
  if (base !== null && !localRevShapeIsSafe(base)) return false;
  const result = await runGit(
    [
      "-C",
      repoRoot,
      "grep",
      "-q",
      "-I",
      "-F",
      ...CLASS_ATTRIBUTES.flatMap((name) => ["-e", name]),
      ...(base !== null ? ["--end-of-options", base] : []),
      "--",
      ":(top,glob)**/.gitattributes",
    ],
    { timeoutMs: 10_000 },
  );
  return result.ok;
}
