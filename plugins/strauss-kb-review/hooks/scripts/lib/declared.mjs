// @ts-check
/**
 * What a subagent says it changed: the fenced `changed` block that ends its
 * turn, one repository-relative path per line, or the word `none`. The
 * declaration scopes the gate to that agent's own work in a shared worktree;
 * the worktree verifies it.
 */

/**
 * @typedef {{ declared: string[], none: boolean } | null} Declaration
 */

/**
 * The last `changed` block in a turn's text, or null when there is none.
 * @param {string | null} text @returns {Declaration}
 */
export function declaredPaths(text) {
  if (typeof text !== "string") return null;
  const blocks = [...text.matchAll(/^```changed\s*\n([\s\S]*?)^```\s*$/gm)];
  const last = blocks.at(-1);
  if (!last) return null;
  const lines = (last[1] ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (lines.length === 1 && lines[0]?.toLowerCase() === "none") {
    return { declared: [], none: true };
  }
  return {
    declared: [...new Set(lines.map(normalize))].filter(Boolean),
    none: false,
  };
}

/** Forward slashes, no leading `./`. @param {string} path */
function normalize(path) {
  return path.split("\\").join("/").replace(/^\.\//, "");
}

/**
 * The paths whose records count as written this turn: the diff's own, plus
 * the bundle paths a declaration names (or, for the parent, the bundle's
 * uncommitted files). Paths outside the bundle are not records and are
 * dropped here.
 * @param {Set<string>} changedPaths @param {string[]} bundlePaths
 * @param {string} bundleDir
 */
export function writtenScope(changedPaths, bundlePaths, bundleDir) {
  const prefix = `${bundleDir.replace(/\/$/, "")}/`;
  return new Set([
    ...changedPaths,
    ...bundlePaths.map(normalize).filter((path) => path.startsWith(prefix)),
  ]);
}

/**
 * Declared paths the worktree does not show as changed: work claimed that
 * was not done, or a path spelled wrong.
 * @param {string[]} declared @param {Iterable<string>} dirty
 */
export function undeclarable(declared, dirty) {
  const seen = new Set([...dirty].map(normalize));
  return declared.filter((path) => !seen.has(path));
}
