// @ts-check
/**
 * What a subagent says it changed: the fenced `changed` block that ends its
 * turn, one repository-relative path per line, or the word `none`. The
 * declaration scopes the gate to that agent's own work in a shared worktree;
 * the worktree verifies it.
 */

/**
 * @typedef {{ declared: string[], classes: Map<string, string>, none: boolean } | null} Declaration
 */

/**
 * The last `changed` block in a turn's text, or null when there is none.
 * Each line is `<path>` or `<path> <class>`; the class is the agent's own
 * word for what kind of change it made there, `source` when absent.
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
    return { declared: [], classes: new Map(), none: true };
  }
  /** @type {Map<string, string>} */
  const classes = new Map();
  /** @type {string[]} */
  const declared = [];
  for (const line of lines) {
    const [rawPath, rawClass] = line.split(/\s+/);
    const path = normalize(rawPath ?? "");
    if (!path || declared.includes(path)) continue;
    declared.push(path);
    if (rawClass) classes.set(path, rawClass.toLowerCase());
  }
  return { declared, classes, none: false };
}

/**
 * Declared classes the repository does not back: a class that lowers
 * scrutiny must come from a `review:*` fact or a `.gitattributes` entry,
 * which is what `classes` (the classifier's answer) already reflects.
 * @param {Map<string, string>} declared @param {Map<string, string>} classes
 * @param {Set<string>} lowering
 * @returns {{ path: string, claimed: string, actual: string }[]}
 */
export function unbackedClasses(declared, classes, lowering) {
  const out = [];
  for (const [path, claimed] of declared) {
    if (!lowering.has(claimed)) continue;
    const actual = classes.get(path) ?? "source";
    if (actual !== claimed) out.push({ path, claimed, actual });
  }
  return out;
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
