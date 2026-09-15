/**
 * Shapes a value must have before it reaches git argv. An argv array stops a
 * shell, not git's own option parsing, so a leading `-` is never allowed and
 * nothing here spawns a process.
 */

/** Long enough for any real branch, short enough to bound the argv. */
const MAX_REF_LENGTH = 200;

const REF_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const LOCAL_REV_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._/^~-]*$/;
const ATTRIBUTE_SHAPE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

/** A ref a fetch may be handed: no `@`, `{`, `\`, spaces or ranges. */
export function refShapeIsSafe(ref: string): boolean {
  if (!ref || ref.length > MAX_REF_LENGTH) return false;
  // `a..b` is a range, not a rev, and `git fetch` would resolve it as one.
  if (ref.includes("..")) return false;
  return REF_SHAPE.test(ref);
}

/** Wider than `refShapeIsSafe` (`~`, `^`) for a local read; never guards a fetch. */
export function localRevShapeIsSafe(rev: string): boolean {
  if (!rev || rev.length > MAX_REF_LENGTH) return false;
  if (rev.includes("..")) return false;
  return LOCAL_REV_SHAPE.test(rev);
}

/**
 * A repo-relative path that may become the path half of `<rev>:<path>`: no
 * leading `-`, no NUL, no `..` segment climbing out of the tree.
 */
export function filePathIsSafe(file: string): boolean {
  const path = file.replace(/^\.\//, "");
  if (!path || path.startsWith("-") || path.includes("\0")) return false;
  return !path.split("/").includes("..");
}

/** A gitattributes name, as `check-attr` takes it before the path list. */
export function attributeNameIsSafe(name: string): boolean {
  return ATTRIBUTE_SHAPE.test(name);
}
