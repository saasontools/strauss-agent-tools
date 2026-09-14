// @ts-check
/**
 * File classes. `strauss-kb classify --git` owns them when the build on PATH
 * has the verb; otherwise a path-pattern list stands in and `--report` says
 * `classifier: "builtin"` so a consumer knows which answer it got.
 */
import { json } from "./cli.mjs";
import { checkAttr } from "./git.mjs";
import { extensionOf, isCodePath } from "./util.mjs";

/** Classes family A skips: nothing here needs a why. */
export const SKIPPED = new Set([
  "test",
  "config",
  "ci",
  "docs",
  "lockfile",
  "generated",
  "rename",
  "kb",
]);

const PATTERNS = [
  [/(^|\/)\.strauss\//, "kb"],
  [
    /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|Cargo\.lock|go\.sum|poetry\.lock)$/,
    "lockfile",
  ],
  [/(^|\/)(__tests__|__mocks__|tests?|e2e|fixtures?)\//, "test"],
  [/\.(spec|test)\.[cm]?[jt]sx?$/, "test"],
  [/(^|\/)(test_|conftest)[^/]*\.py$/, "test"],
  [/(^|\/)generated\//, "generated"],
  [/\.(gen|generated)\.[^/]+$/, "generated"],
  [/(^|\/)\.github\//, "ci"],
  [/(^|\/)(Dockerfile|docker-compose[^/]*|\.dockerignore)$/, "ci"],
  [/(^|\/)(ci|deploy|infra|k8s|helm|terraform)\//, "ci"],
  [/\.(tf|tfvars)$/, "ci"],
  [/(^|\/)\.env(\.|$)/, "ci"],
  [
    /(^|\/)(nx|tsconfig[^/]*|\.eslintrc[^/]*|\.npmrc|pnpm-workspace\.yaml)$/,
    "config",
  ],
  [/(^|\/)tsconfig[^/]*\.json$/, "config"],
  [/\.config\.[cm]?[jt]s$/, "config"],
  [/\.(md|mdx|rst|txt|adoc)$/, "docs"],
];

/**
 * @param {string} path @returns {string}
 */
export function builtinClass(path) {
  for (const [pattern, name] of PATTERNS) {
    if (/** @type {RegExp} */ (pattern).test(path)) return String(name);
  }
  if (isCodePath(path)) return "code";
  return ["json", "yaml", "yml", "toml", "ini", "xml"].includes(
    extensionOf(path),
  )
    ? "config"
    : "other";
}

/**
 * @param {import("./cli.mjs").Launcher} kb
 * @param {string[]} range
 * @param {import("./git.mjs").ChangedFile[]} files
 * @param {string | null} [base] the commit whose `.gitattributes` are read
 * @returns {{ classifier: "cli" | "builtin", classes: Map<string, string> }}
 */
export function classify(kb, range, files, base = null) {
  const fromCli = json(kb, [
    "classify",
    "--git",
    ...range,
    "--offline",
    "--json",
  ]);
  const classes = new Map(
    files.map((file) => [file.path, builtinClass(file.path)]),
  );
  for (const file of files) {
    if (file.status === "R") classes.set(file.path, "rename");
  }
  const rows = cliRows(fromCli);
  if (rows) for (const [path, name] of rows) classes.set(path, name);
  // The repository's own word beats a guessed class: an attribute at the base
  // commit is a reviewed fact about the file. A KB fact on the hunk still wins
  // where the CLI applied one, since it is the more specific claim.
  const attributed = attributeClasses(kb.cwd, base, files.map((file) => file.path));
  for (const [path, name] of attributed) {
    if (!rows || !FACT_CLASSES.has(classes.get(path) ?? "")) classes.set(path, name);
  }
  return { classifier: rows ? "cli" : "builtin", classes };
}

/** Classes only a fact or a banner produces; an attribute never overrides them. */
const FACT_CLASSES = new Set(["boilerplate", "rename"]);

/** Classes a declaration may claim only with the repository behind it. */
export const LOWERING = new Set([
  "generated",
  "boilerplate",
  "docs",
  "test",
  "lockfile",
  "config",
  "ci",
  "rename",
]);

const ATTRIBUTES = [
  "linguist-generated",
  "linguist-vendored",
  "linguist-documentation",
  "strauss-class",
];

/**
 * `.gitattributes` at the base commit, mapped to classes. `linguist-*` are
 * what GitHub already honours; `strauss-class=<class>` covers the rest.
 * @param {string} cwd @param {string | null} base @param {string[]} paths
 * @returns {Map<string, string>}
 */
export function attributeClasses(cwd, base, paths) {
  /** @type {Map<string, string>} */
  const classes = new Map();
  const { attrs } = checkAttr(cwd, base, paths, ATTRIBUTES);
  for (const [path, values] of attrs) {
    const name = attributeClass(values);
    if (name) classes.set(path, name);
  }
  return classes;
}

/** @param {Record<string, string>} values @returns {string | null} */
export function attributeClass(values) {
  const set = (/** @type {string} */ key) =>
    values[key] === "set" || values[key] === "true";
  if (set("linguist-generated") || set("linguist-vendored")) return "generated";
  if (set("linguist-documentation")) return "docs";
  const own = values["strauss-class"];
  return own && LOWERING.has(own) ? own : null;
}

/**
 * The verb answers `{ files: [{ filePath, class }] }`; a bare array of rows and
 * a flat path-to-class map are read too, so a shape change cannot silently
 * leave the built-in answer in place under `classifier: "cli"`.
 * @param {unknown} answer @returns {[string, string][] | null}
 */
function cliRows(answer) {
  if (!answer || typeof answer !== "object") return null;
  const list = Array.isArray(answer)
    ? answer
    : Array.isArray(/** @type {any} */ (answer).files)
      ? /** @type {any[]} */ (/** @type {any} */ (answer).files)
      : null;
  const pairs = list
    ? list.map((row) => [
        /** @type {any} */ (row)?.path ?? /** @type {any} */ (row)?.filePath,
        /** @type {any} */ (row)?.class,
      ])
    : Object.entries(answer);
  return /** @type {[string, string][]} */ (
    pairs.filter(
      ([path, name]) => typeof path === "string" && typeof name === "string",
    )
  );
}
