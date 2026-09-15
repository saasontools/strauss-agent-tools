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
 * The last `changed` block in a turn's text, or null when there is none. The
 * body is JSON, the same envelope the reviewer's `kb` block uses:
 * `{ "paths": [ { "path": "src/a.ts", "class": "generated" } ] }`, with
 * `class` optional (`source` when absent) and an empty `paths` for no
 * changes. A body that is not that shape counts as no block, so the gate asks
 * for one.
 * @param {string | null} text @returns {Declaration}
 */
export function declaredPaths(text) {
  if (typeof text !== "string") return null;
  const blocks = [...text.matchAll(/^```changed\s*\n([\s\S]*?)^```\s*$/gm)];
  const last = blocks.at(-1);
  if (!last) return null;
  /** @type {any} */
  let body;
  try {
    body = JSON.parse(last[1] ?? "");
  } catch {
    return null;
  }
  const entries = Array.isArray(body?.paths) ? body.paths : null;
  if (!entries) return null;
  /** @type {Map<string, string>} */
  const classes = new Map();
  /** @type {string[]} */
  const declared = [];
  for (const entry of entries) {
    const raw = typeof entry === "string" ? entry : entry?.path;
    const path = normalize(typeof raw === "string" ? raw : "");
    if (!path || declared.includes(path)) continue;
    declared.push(path);
    const cls = typeof entry === "object" ? entry?.class : undefined;
    if (typeof cls === "string" && cls) classes.set(path, cls.toLowerCase());
  }
  return { declared, classes, none: declared.length === 0 };
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
