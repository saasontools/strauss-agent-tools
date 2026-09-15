import { checkAttr, localRevShapeIsSafe, runGit } from "@saasontools/git-guard";
import type { Verdict } from "./model.js";
import { attributeVerdict, CLASS_ATTRIBUTES } from "./rules.js";

export type Attributes = {
  /** A verdict per path; only `source` where the read was not pinned. */
  classes: Map<string, Verdict>;
  /** The base declares classes, or nothing could tell: the path table is off. */
  repoDeclares: boolean;
  /** Read at `base`. False: no base, or git could not read attributes there. */
  pinned: boolean;
  /** Pinned, but the probe for declared classes failed. */
  probeFailed: boolean;
};

/** The one verdict an unpinned read may give: it raises scrutiny. */
const RAISE: Verdict = {
  class: "source",
  reason: "attribute strauss-class=source",
};

/**
 * `.gitattributes` at `base`, one batched `check-attr` for every path, so a
 * change cannot reclassify its own files. A read not pinned to the base lowers
 * nothing: only `strauss-class=source` applies and the path table is off.
 * `paths` are relative to `repoRoot`, which `classifyFiles` puts at the top.
 */
export async function readAttributes(
  repoRoot: string,
  base: string | null,
  paths: readonly string[],
): Promise<Attributes> {
  const [{ attrs, pinned }, declares] = await Promise.all([
    checkAttr(repoRoot, base, paths, CLASS_ATTRIBUTES),
    base === null ? null : declaresClasses(repoRoot, base, paths),
  ]);
  const classes = new Map<string, Verdict>();
  for (const [path, values] of attrs) {
    const verdict = pinned
      ? attributeVerdict(values)
      : values["strauss-class"] === "source"
        ? RAISE
        : undefined;
    if (verdict) classes.set(path, verdict);
  }
  if (!pinned) {
    return { classes, repoDeclares: true, pinned, probeFailed: false };
  }
  return {
    classes,
    repoDeclares: declares ?? true,
    pinned,
    probeFailed: declares === null,
  };
}

/**
 * Whether a `.gitattributes` at `base` that can govern `paths` mentions a
 * class attribute: one `cat-file --batch`, bounded by the directories the diff
 * touches. Any mention counts, the safe direction. Null when git failed.
 */
async function declaresClasses(
  repoRoot: string,
  base: string,
  paths: readonly string[],
): Promise<boolean | null> {
  if (!localRevShapeIsSafe(base)) return null;
  const result = await runGit(["-C", repoRoot, "cat-file", "--batch"], {
    input: attributeFiles(paths)
      .map((file) => `${base}:${file}\n`)
      .join(""),
    timeoutMs: 10_000,
    maxBytes: 16 * 1_048_576,
  });
  if (!result.ok) return null;
  return CLASS_ATTRIBUTES.some((name) => result.stdout.includes(name));
}

/** The root's `.gitattributes`, and one per directory above a changed path. */
export function attributeFiles(paths: readonly string[]): string[] {
  const files = new Set([".gitattributes"]);
  for (const path of paths) {
    if (path.includes("\n")) continue;
    const dirs = path.split("/").slice(0, -1);
    for (let depth = 1; depth <= dirs.length; depth += 1) {
      files.add(`${dirs.slice(0, depth).join("/")}/.gitattributes`);
    }
  }
  return [...files];
}
