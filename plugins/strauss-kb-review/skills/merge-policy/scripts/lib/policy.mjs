// @ts-check
/**
 * The policy file, read from the base rev and never from the head: a branch
 * must not weaken the rules it is judged by.
 *
 * JSON is canonical. Floor keys are tags — `review:security` — and a colon in
 * a YAML key needs quoting, which the gate's YAML subset cannot read. A
 * `.yaml` policy is still parsed for everything else; its floors fall back to
 * the defaults and the run says so in `notChecked`.
 */
import { createHash } from "node:crypto";
import { parseFrontmatter } from "../../../../hooks/scripts/lib/util.mjs";

/** Where a policy lives when `--policy` did not name one. JSON first. */
export const POLICY_PATHS = [
  ".strauss/merge-policy.json",
  ".strauss/merge-policy.yaml",
  ".strauss/merge-policy.yml",
];

/** The top-level keys a policy may carry. One of them must be there: a file
 * that parses to nothing is garbled, not permissive. */
export const POLICY_KEYS = [
  "version",
  "enabled",
  "owners",
  "floors",
  "materialityFloors",
  "auto",
  "review",
  "human",
];

/** Least to most material. A floor raises; an author value never lowers one. */
export const MATERIALITY = ["non-blocking", "important", "blocking"];

/** Tags whose records are `important` whatever the author wrote. */
export const DEFAULT_FLOORS = {
  "review:security": "important",
  "review:data": "important",
  "review:compat": "important",
};

/** Classes that need no why, so a diff made only of them can route auto. */
export const DEFAULT_AUTO_CLASSES = [
  "test",
  "config",
  "ci",
  "docs",
  "lockfile",
  "generated",
  "boilerplate",
  "rename",
];

/**
 * @typedef {{ enabled: "true" | "false" | "dry-run", owners: string[],
 *   floors: Record<string, string>, autoClasses: string[],
 *   include: string[], exclude: string[], humanTypes: string[],
 *   humanTags: string[] }} PolicyData
 * @typedef {{ present: boolean, path: string | null, version: unknown,
 *   hash: string | null, format: "json" | "yaml" | null,
 *   data: PolicyData, notChecked: string[], errors: string[] }} Policy
 */

/** @returns {PolicyData} */
function defaults() {
  return {
    enabled: "true",
    owners: [],
    floors: { ...DEFAULT_FLOORS },
    autoClasses: [...DEFAULT_AUTO_CLASSES],
    include: [],
    exclude: [],
    humanTypes: [],
    humanTags: [],
  };
}

/**
 * The policy as of `base`. `paths` is the candidate list; the first that
 * exists there wins, and every candidate is still watched for a change.
 * @param {(args: string[]) => string | null} show `git show <rev>:<path>`
 * @param {string} base @param {string[]} paths
 * @returns {Policy}
 */
export function readPolicy(show, base, paths) {
  for (const path of paths) {
    const text = show([`${base}:${path}`]);
    if (text === null) continue;
    const format = path.endsWith(".json") ? "json" : "yaml";
    const parsed =
      format === "json"
        ? parseJson(text)
        : { data: parseYaml(text), error: null };
    const policy = {
      present: true,
      path,
      version: /** @type {any} */ (parsed.data).version ?? null,
      hash: `sha256:${createHash("sha256").update(text).digest("hex")}`,
      format: /** @type {"json" | "yaml"} */ (format),
      data: defaults(),
      /** @type {string[]} */ notChecked: [],
      /** @type {string[]} */ errors: parsed.error ? [parsed.error] : [],
    };
    if (!parsed.error) {
      const named = POLICY_KEYS.filter((key) => key in parsed.data);
      if (named.length === 0) {
        policy.errors.push(
          `${path} names none of ${POLICY_KEYS.join(", ")} — it did not parse`,
        );
      } else validate(policy, parsed.data);
    }
    return policy;
  }
  return {
    present: false,
    path: null,
    version: null,
    hash: null,
    format: null,
    data: defaults(),
    notChecked: [],
    errors: [],
  };
}

/** @param {string} text */
function parseJson(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? { data: /** @type {Record<string, unknown>} */ (value), error: null }
      : { data: {}, error: "policy is not a JSON object" };
  } catch (error) {
    return { data: {}, error: `policy is not JSON: ${String(error)}` };
  }
}

/** The gate's frontmatter subset, over a bare document. @param {string} text */
function parseYaml(text) {
  return parseFrontmatter(`---\n${text}\n---\n`).data;
}

/**
 * A hand-written checker: every key this step reads, and nothing else. An
 * unreadable value is an error, never a silent default — a policy nobody can
 * parse must not look like a permissive one.
 * @param {Policy} policy @param {Record<string, unknown>} raw
 */
function validate(policy, raw) {
  const data = policy.data;
  const enabled = raw.enabled;
  if (enabled !== undefined) {
    if (enabled === true || enabled === "true") data.enabled = "true";
    else if (enabled === false || enabled === "false") data.enabled = "false";
    else if (enabled === "dry-run") data.enabled = "dry-run";
    else
      policy.errors.push(
        `enabled: ${String(enabled)} is not true|false|dry-run`,
      );
  }
  data.owners = strings(raw.owners, "owners", policy);
  data.include = strings(
    pick(raw, ["auto", "paths"]) ?? pick(raw, ["review", "include"]),
    "auto.paths",
    policy,
  );
  data.exclude = strings(
    pick(raw, ["auto", "exclude"]) ?? pick(raw, ["review", "exclude"]),
    "review.exclude",
    policy,
  );
  data.humanTypes = strings(
    pick(raw, ["human", "types"]),
    "human.types",
    policy,
  );
  data.humanTags = strings(pick(raw, ["human", "tags"]), "human.tags", policy);

  const classes = pick(raw, ["auto", "classes"]);
  if (classes !== undefined)
    data.autoClasses = strings(classes, "auto.classes", policy);

  const floors = raw.floors ?? raw.materialityFloors;
  if (floors && typeof floors === "object" && !Array.isArray(floors)) {
    for (const [tag, level] of Object.entries(floors)) {
      if (typeof level === "string" && MATERIALITY.includes(level)) {
        data.floors[tag] = level;
      } else {
        policy.errors.push(
          `floors.${tag}: ${String(level)} is not a materiality`,
        );
      }
    }
  } else if (floors !== undefined && policy.format === "yaml") {
    // The one construct the YAML subset cannot read: a quoted key holding a
    // colon. JSON is the canonical format for exactly this reason.
    policy.notChecked.push(
      "floors: built-in defaults — a YAML policy's tag keys are unreadable; use .strauss/merge-policy.json",
    );
  } else if (floors !== undefined) {
    policy.errors.push("floors must be a map of tag to materiality");
  }
}

/** @param {Record<string, unknown>} raw @param {string[]} path */
function pick(raw, path) {
  /** @type {unknown} */
  let value = raw;
  for (const key of path) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return undefined;
    value = /** @type {Record<string, unknown>} */ (value)[key];
  }
  return value;
}

/** @param {unknown} value @param {string} name @param {Policy} policy */
function strings(value, name, policy) {
  if (value === undefined || value === null || value === "") return [];
  if (!Array.isArray(value)) {
    policy.errors.push(`${name} must be a list`);
    return [];
  }
  return value.filter((item) => typeof item === "string").map(String);
}

/** @param {string | undefined} value */
export function rank(value) {
  const at = MATERIALITY.indexOf(String(value ?? ""));
  return at < 0 ? 0 : at;
}

/**
 * `max(author, floor)` over the record's tags. A floor only ever raises.
 * @param {string | undefined} authored @param {string[]} tags
 * @param {Record<string, string>} floors
 */
export function effectiveMateriality(authored, tags, floors) {
  let best = rank(authored);
  for (const tag of tags) best = Math.max(best, rank(floors[tag]));
  return MATERIALITY[best] ?? "non-blocking";
}

/** A glob over `/`-separated paths: `**` any depth, `*` one segment.
 * @param {string} glob */
export function globToRegExp(glob) {
  let source = "";
  for (let at = 0; at < glob.length; at += 1) {
    const char = glob[at];
    if (char === "*" && glob[at + 1] === "*") {
      // `a/**` covers `a` itself as well as everything under it.
      source += glob[at + 2] === "/" ? "(?:.*\\/)?" : ".*";
      at += glob[at + 2] === "/" ? 2 : 1;
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += (char ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

/** @param {string} path @param {string[]} globs */
export function matchesAny(path, globs) {
  return globs.some((glob) => globToRegExp(glob).test(path));
}
