// @ts-check
/**
 * File classes. `strauss-kb classify --git` owns them when the build on PATH
 * has the verb; otherwise a path-pattern list stands in and `--report` says
 * `classifier: "builtin"` so a consumer knows which answer it got.
 */
import { json } from "./cli.mjs";
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
 * @returns {{ classifier: "cli" | "builtin", classes: Map<string, string> }}
 */
export function classify(kb, range, files) {
  const fromCli = json(kb, ["classify", "--git", ...range, "--json"]);
  const classes = new Map(
    files.map((file) => [file.path, builtinClass(file.path)]),
  );
  for (const file of files) {
    if (file.status === "R") classes.set(file.path, "rename");
  }
  if (!fromCli || typeof fromCli !== "object") {
    return { classifier: "builtin", classes };
  }
  const entries = Array.isArray(fromCli)
    ? fromCli.map((row) => [row?.path, row?.class])
    : Object.entries(fromCli);
  for (const [path, name] of entries) {
    if (typeof path === "string" && typeof name === "string")
      classes.set(path, name);
  }
  return { classifier: "cli", classes };
}
