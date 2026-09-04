// @ts-check
/**
 * Where one part of a language pack comes from. Four forms, all of which end
 * as one fully-resolved https URL in the lock:
 *
 * - `queries/tags.scm` — relative to `npm:<the pack's package>@<pinned>/`
 * - `npm:<pkg>[@<ver>]/<path>` — jsDelivr's npm mirror
 * - `gh:<owner>/<repo>@<ref>/<path>` — jsDelivr's GitHub mirror
 * - `https://…` — verbatim
 */

const NPM = "https://cdn.jsdelivr.net/npm";
const GH = "https://cdn.jsdelivr.net/gh";

/**
 * @typedef {{ kind: "npm", pkg: string, version?: string, path: string,
 *     own?: boolean }
 *   | { kind: "gh", repo: string, ref: string, path: string }
 *   | { kind: "url", url: string }} Locator
 *
 * `own` marks the bare-path form, whose version is the pack's own rather than
 * that package's newest.
 */

/**
 * @param {string} value @param {string} pkg the pack's own package
 * @returns {Locator}
 */
export function parseLocator(value, pkg) {
  if (/^https?:\/\//.test(value)) return { kind: "url", url: value };
  if (value.startsWith("npm:")) return npmLocator(value.slice(4));
  if (value.startsWith("gh:")) return ghLocator(value.slice(3));
  if (value.includes(":"))
    throw new Error(`${value}: not a locator (npm:, gh:, https:, or a path)`);
  return { kind: "npm", pkg, path: strip(value), own: true };
}

/** @param {string} rest @returns {Locator} */
function npmLocator(rest) {
  const scoped = rest.startsWith("@");
  const at = nth(rest, "/", scoped ? 2 : 1);
  if (at === -1) throw new Error(`npm:${rest}: no path after the package`);
  const spec = rest.slice(0, at);
  const cut = spec.lastIndexOf("@");
  const versioned = cut > 0;
  return {
    kind: "npm",
    pkg: versioned ? spec.slice(0, cut) : spec,
    ...(versioned ? { version: spec.slice(cut + 1) } : {}),
    path: strip(rest.slice(at + 1)),
  };
}

/** @param {string} rest @returns {Locator} */
function ghLocator(rest) {
  const found = /^([^/]+\/[^/@]+)@([^/]+)\/(.+)$/.exec(rest);
  if (!found)
    throw new Error(`gh:${rest}: expected gh:<owner>/<repo>@<ref>/<path>`);
  return {
    kind: "gh",
    repo: `${found[1]}`,
    ref: `${found[2]}`,
    path: strip(`${found[3]}`),
  };
}

/**
 * The URL the lock records. `version` and `commit` are what the caller
 * resolved for a locator that named neither.
 * @param {Locator} locator
 * @param {{ version?: string, commit?: string }} resolved
 */
export function locatorUrl(locator, resolved) {
  if (locator.kind === "url") return locator.url;
  if (locator.kind === "gh")
    return `${GH}/${locator.repo}@${resolved.commit}/${locator.path}`;
  const version = locator.version ?? resolved.version;
  return `${NPM}/${locator.pkg}@${version}/${locator.path}`;
}

/**
 * The version or commit a previously locked URL pinned this same locator to,
 * so a re-pin holds still instead of drifting to whatever is newest. A URL
 * that names a different package, repository or path pins nothing here.
 * @param {Locator} locator @param {string | undefined} url
 */
export function lockedRef(locator, url) {
  if (!url || locator.kind === "url") return undefined;
  const [prefix, suffix] =
    locator.kind === "gh"
      ? [`${GH}/${locator.repo}@`, `/${locator.path}`]
      : [`${NPM}/${locator.pkg}@`, `/${locator.path}`];
  if (!url.startsWith(prefix) || !url.endsWith(suffix)) return undefined;
  const middle = url.slice(prefix.length, url.length - suffix.length);
  return middle.includes("/") ? undefined : middle;
}

/** How a part reads in a log line or an error. */
export function locatorLabel(locator) {
  if (locator.kind === "url") return locator.url;
  if (locator.kind === "gh")
    return `gh:${locator.repo}@${locator.ref}/${locator.path}`;
  return `npm:${locator.pkg}${locator.version ? `@${locator.version}` : ""}/${locator.path}`;
}

/** @param {string} path */
function strip(path) {
  return path.replace(/^\/+/, "");
}

/** @param {string} value @param {string} needle @param {number} count */
function nth(value, needle, count) {
  let at = -1;
  for (let found = 0; found < count; found++) {
    at = value.indexOf(needle, at + 1);
    if (at === -1) return -1;
  }
  return at;
}
