// @ts-check
/**
 * The policy file, read from the base rev and never from the head: a branch
 * must not weaken the rules it is judged by.
 *
 * An allowlist, default deny: nothing is `auto` unless a layer named it.
 * Layers are org defaults, the repo file, then its path-scoped `overrides`,
 * and a deeper layer may only escalate — see `merge`.
 *
 * JSON is canonical. Tag keys hold a colon, which the gate's YAML subset
 * cannot read, so a `.yaml` policy's `tags` and `floors` fall back and the run
 * says so in `notChecked`.
 */
import { createHash } from "node:crypto";
import { parseFrontmatter } from "../../../../hooks/scripts/lib/util.mjs";

/** Where a policy lives when `--policy` did not name one. JSON first. */
export const POLICY_PATHS = [
  ".strauss/merge-policy.json",
  ".strauss/merge-policy.yaml",
  ".strauss/merge-policy.yml",
];

/** Where GitHub looks for CODEOWNERS, in its own order. */
export const CODEOWNERS_PATHS = [
  "CODEOWNERS",
  ".github/CODEOWNERS",
  "docs/CODEOWNERS",
];

/** The top-level keys a policy may carry. One of them must be there: a file
 * that parses to nothing is garbled, not permissive. */
export const POLICY_KEYS = [
  "version",
  "enabled",
  "owners",
  "types",
  "tags",
  "floors",
  "materialityFloors",
  "auto",
  "review",
  "human",
  "verifiers",
  "overrides",
];

/** Least to most material. A floor raises; an author value never lowers one. */
export const MATERIALITY = ["non-blocking", "important", "blocking"];

/** What a `types` or `tags` entry may say, least to most human-ward. `off` is
 * the unlisted behaviour written down; `auto` makes a record eligible for
 * `auto-mechanical`; `human` routes. A layer may raise one, never lower it. */
export const DISPOSITIONS = ["auto", "off", "human"];

/** Tags whose records are `important` whatever the author wrote. A layer may
 * raise one of these; nothing lowers them. */
export const DEFAULT_FLOORS = {
  "review:security": "important",
  "review:data": "important",
  "review:compat": "important",
};

/** The classifier classes `auto.classes` may name — SAA-728's set less
 * `source`, which is the one class no policy may wave through. */
export const AUTO_CLASSES = [
  "test",
  "config",
  "ci",
  "docs",
  "lockfile",
  "generated",
  "boilerplate",
  "rename",
];

/** What an excluded file that imports an included one is worth. `auto` is not
 * a value: an exclusion that crosses and is still auto-eligible is `off`. */
export const CROSSINGS = ["off", "human"];

/**
 * @typedef {"auto" | "off" | "human"} Disposition
 * @typedef {{ enabled: "true" | "false" | "dry-run", owners: string[],
 *   floors: Record<string, string>, autoClasses: string[],
 *   autoPaths: string[], include: string[], exclude: string[],
 *   crossing: "off" | "human", types: Record<string, Disposition>,
 *   tags: Record<string, Disposition>, verifiers: string[] }} PolicyData
 * @typedef {{ present: boolean, path: string | null, version: unknown,
 *   hash: string | null, format: "json" | "yaml" | null, layers: string[],
 *   data: PolicyData, notChecked: string[], errors: string[] }} Policy
 * @typedef {Partial<PolicyData>} Layer one file's or one override's say
 */

/** @returns {PolicyData} */
function defaults() {
  return {
    enabled: "true",
    owners: [],
    floors: { ...DEFAULT_FLOORS },
    autoClasses: [],
    autoPaths: [],
    include: [],
    exclude: [],
    crossing: "human",
    types: {},
    tags: {},
    verifiers: [],
  };
}

/**
 * The policy as of `base`. `paths` is the candidate list; the first that
 * exists there wins, and every candidate is still watched for a change.
 * @param {(args: string[]) => string | null} show `git show <rev>:<path>`
 * @param {string} base @param {string[]} paths
 * @param {{ defaults?: { path: string, text: string | null } | null,
 *   changed?: string[] }} [options] the org defaults file, and the range's
 *   changed paths, which decide which `overrides` entries apply
 * @returns {Policy}
 */
export function readPolicy(show, base, paths, options = {}) {
  const policy = {
    present: false,
    /** @type {string | null} */ path: null,
    /** @type {unknown} */ version: null,
    /** @type {string | null} */ hash: null,
    /** @type {"json" | "yaml" | null} */ format: null,
    /** @type {string[]} */ layers: [],
    data: defaults(),
    /** @type {string[]} */ notChecked: [],
    /** @type {string[]} */ errors: [],
  };
  /** @type {Layer[]} */
  const layers = [];

  const org = orgLayer(policy, options.defaults ?? null);
  if (org) layers.push(org);

  for (const path of paths) {
    const text = show([`${base}:${path}`]);
    if (text === null) continue;
    policy.present = true;
    policy.path = path;
    policy.format = path.endsWith(".json") ? "json" : "yaml";
    const parsed =
      policy.format === "json"
        ? parseJson(text)
        : { data: parseYaml(text), error: null };
    if (parsed.error) {
      policy.errors.push(parsed.error);
      break;
    }
    const named = POLICY_KEYS.filter((key) => key in parsed.data);
    if (named.length === 0) {
      policy.errors.push(
        `${path} names none of ${POLICY_KEYS.join(", ")} — it did not parse`,
      );
      break;
    }
    policy.version = /** @type {any} */ (parsed.data).version ?? null;
    layers.push(layerOf(policy, parsed.data, "repo"));
    policy.layers.push("repo");
    layers.push(...overrideLayers(policy, parsed.data, options.changed ?? []));
    break;
  }

  merge(policy.data, layers);
  // The hash covers the merged effective policy, not the file: two spellings
  // of the same rules hash alike, and an override changes it.
  if (policy.present || policy.layers.length > 0) {
    const text = canonical(policy.data);
    policy.hash = `sha256:${createHash("sha256").update(text).digest("hex")}`;
  }
  return policy;
}

/**
 * The org defaults file named by `$STRAUSS_MERGE_POLICY_DEFAULTS`. Named and
 * unreadable is an error, not a silent absence: a default nobody can read must
 * not look like a permissive one.
 * @param {Policy} policy
 * @param {{ path: string, text: string | null } | null} supplied
 * @returns {Layer | null}
 */
function orgLayer(policy, supplied) {
  if (!supplied) return null;
  if (supplied.text === null) {
    policy.errors.push(`org defaults ${supplied.path} is not readable`);
    return null;
  }
  const parsed = parseJson(supplied.text);
  if (parsed.error) {
    policy.errors.push(`org defaults ${supplied.path}: ${parsed.error}`);
    return null;
  }
  policy.layers.push("defaults");
  return layerOf(policy, parsed.data, "defaults");
}

/**
 * The `overrides` entries whose `paths` this range touched. A layer is scoped
 * to the range, not to a file: an override that matches any changed path
 * applies to the whole run, because `types` and `tags` key on records.
 * @param {Policy} policy @param {Record<string, unknown>} raw
 * @param {string[]} changed @returns {Layer[]}
 */
function overrideLayers(policy, raw, changed) {
  const list = raw.overrides;
  if (list === undefined) return [];
  if (!Array.isArray(list)) {
    policy.errors.push("overrides must be a list");
    return [];
  }
  /** @type {Layer[]} */
  const layers = [];
  list.forEach((entry, at) => {
    const where = `overrides[${at}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      policy.errors.push(`${where} must be an object`);
      return;
    }
    const record = /** @type {Record<string, unknown>} */ (entry);
    const globs = strings(record.paths, `${where}.paths`, policy);
    if (globs.length === 0) {
      policy.errors.push(`${where}.paths must name at least one glob`);
      return;
    }
    if (!changed.some((path) => matchesAny(path, globs))) return;
    layers.push(layerOf(policy, record, where));
    policy.layers.push(`override:${at}`);
  });
  return layers;
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
 * A hand-written checker: every key a layer may carry, and nothing else. An
 * unreadable value is an error, never a silent default — a policy nobody can
 * parse must not look like a permissive one.
 * @param {Policy} policy @param {Record<string, unknown>} raw
 * @param {string} where the layer's name, for the error text
 * @returns {Layer}
 */
function layerOf(policy, raw, where) {
  const at = where === "repo" || where === "defaults" ? "" : `${where}.`;
  /** @type {Layer} */
  const layer = {};

  const enabled = raw.enabled;
  if (enabled !== undefined) {
    if (enabled === true || enabled === "true") layer.enabled = "true";
    else if (enabled === false || enabled === "false") layer.enabled = "false";
    else if (enabled === "dry-run") layer.enabled = "dry-run";
    else
      policy.errors.push(
        `${at}enabled: ${String(enabled)} is not true|false|dry-run`,
      );
  }
  if (raw.owners !== undefined)
    layer.owners = strings(raw.owners, `${at}owners`, policy);
  if (raw.verifiers !== undefined)
    layer.verifiers = strings(raw.verifiers, `${at}verifiers`, policy);

  const include = pick(raw, ["review", "include"]);
  if (include !== undefined)
    layer.include = strings(include, `${at}review.include`, policy);
  const exclude = pick(raw, ["review", "exclude"]);
  if (exclude !== undefined)
    layer.exclude = strings(exclude, `${at}review.exclude`, policy);
  const crossing = pick(raw, ["review", "crossing"]);
  if (crossing !== undefined) {
    if (typeof crossing === "string" && CROSSINGS.includes(crossing))
      layer.crossing = /** @type {"off" | "human"} */ (crossing);
    else
      policy.errors.push(
        `${at}review.crossing: ${String(crossing)} is not ${CROSSINGS.join("|")}`,
      );
  }

  const classes = pick(raw, ["auto", "classes"]);
  if (classes !== undefined) {
    layer.autoClasses = strings(classes, `${at}auto.classes`, policy).filter(
      (name) => {
        if (AUTO_CLASSES.includes(name)) return true;
        policy.errors.push(
          `${at}auto.classes: ${name} is not one of ${AUTO_CLASSES.join(", ")}`,
        );
        return false;
      },
    );
  }
  const autoPaths = pick(raw, ["auto", "paths"]);
  if (autoPaths !== undefined)
    layer.autoPaths = strings(autoPaths, `${at}auto.paths`, policy);

  const types = dispositions(policy, raw.types, `${at}types`);
  const tags = dispositions(policy, raw.tags, `${at}tags`);
  // The SAA-741 shape, read for one release: every entry means `human`.
  for (const [key, name] of /** @type {const} */ ([
    ["types", "human.types"],
    ["tags", "human.tags"],
  ])) {
    const legacy = pick(raw, ["human", key]);
    if (legacy === undefined) continue;
    const target = key === "types" ? types : tags;
    for (const entry of strings(legacy, `${at}${name}`, policy))
      target[entry] = "human";
  }
  if (Object.keys(types).length > 0) layer.types = types;
  if (Object.keys(tags).length > 0) layer.tags = tags;

  const floors = raw.floors ?? raw.materialityFloors;
  if (floors && typeof floors === "object" && !Array.isArray(floors)) {
    /** @type {Record<string, string>} */
    const read = {};
    for (const [tag, level] of Object.entries(floors)) {
      if (typeof level === "string" && MATERIALITY.includes(level))
        read[tag] = level;
      else
        policy.errors.push(
          `${at}floors.${tag}: ${String(level)} is not a materiality`,
        );
    }
    layer.floors = read;
  } else if (floors !== undefined && policy.format === "yaml") {
    // The one construct the YAML subset cannot read: a quoted key holding a
    // colon. JSON is the canonical format for exactly this reason.
    policy.notChecked.push(
      "floors: built-in defaults — a YAML policy's tag keys are unreadable; use .strauss/merge-policy.json",
    );
  } else if (floors !== undefined) {
    policy.errors.push(`${at}floors must be a map of tag to materiality`);
  }
  return layer;
}

/**
 * A `types` or `tags` map. Every value is checked against the closed set: an
 * unknown one is a policy error, which routes human.
 * @param {Policy} policy @param {unknown} raw @param {string} name
 * @returns {Record<string, Disposition>}
 */
function dispositions(policy, raw, name) {
  /** @type {Record<string, Disposition>} */
  const read = {};
  if (raw === undefined) return read;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    policy.errors.push(
      `${name} must be a map of key to ${DISPOSITIONS.join("|")}`,
    );
    return read;
  }
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && DISPOSITIONS.includes(value))
      read[key] = /** @type {Disposition} */ (value);
    else
      policy.errors.push(
        `${name}.${key}: ${String(value)} is not ${DISPOSITIONS.join("|")}`,
      );
  }
  return read;
}

/**
 * Fold the layers, shallowest first. `types`, `tags`, `floors` and the `auto`
 * allowlist only ever escalate: a disposition and a floor rise, and the
 * allowlist narrows to the intersection. Everything else takes the deepest
 * layer that named it.
 * @param {PolicyData} data @param {Layer[]} layers
 */
function merge(data, layers) {
  /** @type {Set<string>} */
  const named = new Set();
  for (const layer of layers) {
    if (layer.enabled !== undefined) data.enabled = layer.enabled;
    if (layer.owners !== undefined) data.owners = layer.owners;
    if (layer.verifiers !== undefined) data.verifiers = layer.verifiers;
    if (layer.include !== undefined) data.include = layer.include;
    if (layer.exclude !== undefined) data.exclude = layer.exclude;
    if (layer.crossing !== undefined) data.crossing = layer.crossing;

    for (const key of /** @type {const} */ (["autoClasses", "autoPaths"])) {
      const next = layer[key];
      if (next === undefined) continue;
      data[key] = named.has(key)
        ? data[key].filter((item) => next.includes(item))
        : [...next];
      named.add(key);
    }
    for (const key of /** @type {const} */ (["types", "tags"])) {
      for (const [name, value] of Object.entries(layer[key] ?? {}))
        data[key][name] = raise(DISPOSITIONS, data[key][name], value);
    }
    for (const [tag, level] of Object.entries(layer.floors ?? {}))
      data.floors[tag] = raise(MATERIALITY, data.floors[tag], level);
  }
}

/** The more escalated of two values on one ordered scale.
 * @param {string[]} scale @param {string | undefined} held @param {string} next */
function raise(scale, held, next) {
  if (held === undefined) return /** @type {any} */ (next);
  const at = Math.max(scale.indexOf(held), scale.indexOf(next));
  return /** @type {any} */ (scale[at] ?? next);
}

/** Stable text for the hash: the merged policy, keys in sorted order, so the
 * same effective rules hash the same however they were spelled.
 * @param {unknown} value @returns {string} */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(
      /** @type {Record<string, unknown>} */ (value),
    )
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
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

/**
 * Does a CODEOWNERS file put an owner on `path`? Its patterns are gitignore
 * shaped: rooted with a leading `/`, a bare name matches at any depth, and a
 * trailing `/` is the directory's subtree.
 * @param {string} text @param {string} path
 */
export function codeownersCover(text, path) {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const pattern = trimmed.split(/\s+/)[0] ?? "";
    if (!pattern || !/\s/.test(trimmed)) continue;
    const globs = pattern.endsWith("/")
      ? [`${pattern.replace(/^\/|\/$/g, "")}/**`]
      : pattern.startsWith("/")
        ? [pattern.slice(1), `${pattern.slice(1)}/**`]
        : pattern.includes("/")
          ? [pattern, `${pattern}/**`]
          : [`**/${pattern}`, `**/${pattern}/**`];
    if (matchesAny(path, globs)) return true;
  }
  return false;
}
