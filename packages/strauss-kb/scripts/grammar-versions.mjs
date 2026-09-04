// @ts-check
/**
 * The exact grammar release every wasm in a `tree-sitter-wasms` version was
 * built from, so the tags query can be pinned to the same one.
 *
 * `tree-sitter-wasms` declares its grammars as caret ranges, which resolve to
 * whatever was newest on build day. Two rules recover the truth: `lockfile`,
 * the lockfile committed at the release, and — absent one — `published-before`,
 * the newest release satisfying the range that npm published before it.
 */
import { getJson, text, tryGet, tryGetJson } from "./grammar-http.mjs";

const REGISTRY = "https://registry.npmjs.org";
const RAW = "https://raw.githubusercontent.com";
const LOCKFILES = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"];

/**
 * @typedef {"lockfile" | "published-before"} Rule
 * @typedef {{ rule: Rule, version: string } | { rule: Rule, repo: string, commit: string }} Resolved
 */

/**
 * Every grammar `pkg@version` builds from, by npm package name.
 * @param {string} pkg @param {string} version
 * @returns {Promise<Map<string, Resolved>>}
 */
export async function resolveGrammarVersions(pkg, version) {
  const document = await getJson(`${REGISTRY}/${pkg}`);
  const release = document.versions?.[version];
  if (!release) throw new Error(`${pkg}@${version} is not published`);
  const publishedAt = Date.parse(document.time?.[version]);
  const ranges = /** @type {Record<string, string>} */ (
    release.devDependencies ?? {}
  );

  const slug = repoSlug(release.repository?.url ?? release.repository);
  const locked = slug
    ? await lockedVersions(slug, [release.gitHead, `v${version}`, version])
    : new Map();

  /** @type {Map<string, Resolved>} */
  const resolved = new Map();
  for (const [name, range] of Object.entries(ranges)) {
    const fromLock = locked.get(name);
    if (fromLock) {
      resolved.set(name, { ...fromLock, rule: "lockfile" });
      continue;
    }
    const before = await publishedBefore(name, range, publishedAt);
    if (before) resolved.set(name, { rule: "published-before", ...before });
  }
  return resolved;
}

/** `git+https://github.com/Gregoor/tree-sitter-wasms.git` → `Gregoor/…`. */
function repoSlug(url) {
  const found = /github\.com[/:]([^/]+\/[^/#]+?)(?:\.git)?$/.exec(
    typeof url === "string" ? url : "",
  );
  return found?.[1];
}

/**
 * The first lockfile found among `refs`, parsed. A published package carries
 * the commit it was published from, which beats guessing at a release tag.
 * @param {string} slug @param {(string | undefined)[]} refs
 */
async function lockedVersions(slug, refs) {
  for (const ref of refs) {
    if (!ref) continue;
    for (const name of LOCKFILES) {
      const bytes = await tryGet(`${RAW}/${slug}/${ref}/${name}`);
      if (!bytes) continue;
      const body = text(bytes);
      const parsed =
        name === "package-lock.json"
          ? npmLocked(body)
          : name === "yarn.lock"
            ? yarnLocked(body)
            : pnpmLocked(body);
      if (parsed.size) return parsed;
    }
  }
  return new Map();
}

/** @typedef {{ version: string } | { repo: string, commit: string }} Pin */

/**
 * pnpm's `<name>: { specifier, version }` importer blocks, v6 and v9 alike.
 * @param {string} body @returns {Map<string, Pin>}
 */
function pnpmLocked(body) {
  /** @type {Map<string, Pin>} */
  const pins = new Map();
  const entry =
    /^\s+'?([^'\s:][^:\n]*?)'?:\n\s+specifier:.*\n\s+version:\s*(\S+)/gm;
  for (const [, name, version] of body.matchAll(entry)) {
    if (name && version) pins.set(name, pin(version));
  }
  return pins;
}

/** @param {string} body @returns {Map<string, Pin>} */
function npmLocked(body) {
  /** @type {Map<string, Pin>} */
  const pins = new Map();
  const packages = JSON.parse(body).packages ?? {};
  for (const [path, entry] of Object.entries(packages)) {
    const name = path.startsWith("node_modules/")
      ? path.slice("node_modules/".length)
      : undefined;
    const value = /** @type {{ version?: string, resolved?: string }} */ (
      entry
    );
    if (!name || name.includes("/node_modules/")) continue;
    pins.set(name, pin(gitOrVersion(value.resolved, value.version)));
  }
  return pins;
}

/** Yarn v1: a `"<name>@<range>":` header over an indented block. */
function yarnLocked(body) {
  /** @type {Map<string, Pin>} */
  const pins = new Map();
  for (const block of body.split(/\n(?=\S)/)) {
    const name = /^"?((?:@[^/]+\/)?[^@\s"]+)@/.exec(block)?.[1];
    if (!name) continue;
    const resolved = /^\s+resolved "([^"]+)"/m.exec(block)?.[1];
    const version = /^\s+version "([^"]+)"/m.exec(block)?.[1];
    pins.set(name, pin(gitOrVersion(resolved, version)));
  }
  return pins;
}

/** A git URL carries the commit; anything else means the plain version. */
function gitOrVersion(resolved, version) {
  return resolved && /github\.com/.test(resolved) ? resolved : (version ?? "");
}

/** A lockfile value: a git URL carrying a commit, or a plain version. */
function pin(value) {
  const git =
    /github\.com[/:]([^/]+)\/([^/#.]+)(?:\.git)?[/#]([0-9a-f]{40})/.exec(value);
  if (git) return { repo: `${git[1]}/${git[2]}`, commit: `${git[3]}` };
  return { version: value.replace(/\(.*$/, "").replace(/^.*\//, "") };
}

/**
 * The newest release satisfying `range` that npm published before `at` — what
 * a caret would have resolved to on build day.
 * @param {string} name @param {string} range @param {number} at
 */
async function publishedBefore(name, range, at) {
  if (/^(?:github|git\+|https?):/.test(range) || range.includes("#"))
    return undefined;
  const document = await tryGetJson(`${REGISTRY}/${encodeURIComponent(name)}`);
  if (!document) return undefined;
  const candidates = Object.keys(document.versions ?? {})
    .filter((version) => !version.includes("-") && satisfies(version, range))
    .filter((version) => Date.parse(document.time?.[version]) < at)
    .sort(compare);
  const newest = candidates.at(-1);
  return newest ? { version: newest } : undefined;
}

/** Caret and exact ranges only — the two `tree-sitter-wasms` uses. */
function satisfies(version, range) {
  if (!range.startsWith("^")) return version === range;
  const low = parts(range.slice(1));
  const of = parts(version);
  if (compare(version, range.slice(1)) < 0) return false;
  const at = low.findIndex((part) => part > 0);
  const significant = at === -1 ? 0 : at;
  return low
    .slice(0, significant + 1)
    .every((part, index) => part === of[index]);
}

/** @param {string} version */
function parts(version) {
  return version.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function compare(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let at = 0; at < 3; at++) {
    const difference = (x[at] ?? 0) - (y[at] ?? 0);
    if (difference) return difference;
  }
  return 0;
}
