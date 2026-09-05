// @ts-check
/**
 * packs.json entry → the exact URLs one language pack is built from.
 *
 * A pack holds still by default: the version a part was locked at last run is
 * reused, so re-pinning the same packs.json reproduces the same manifest. Only
 * `upgrade` re-asks the registry what is newest.
 */
import {
  lockedRef,
  locatorUrl,
  parseLocator,
  repoOf,
} from "./locators.mjs";
import { newestVersion, refCommit } from "./registry.mjs";

/** What a pack gets when it names neither `wasm` nor `tags`. */
const DEFAULT_WASM = (pkg) => `${pkg.replace(/^.*[/@]/, "")}.wasm`;
const DEFAULT_TAGS = "queries/tags.scm";

/**
 * @typedef {{ package: string, version?: string, wasm?: string,
 *   tags?: string | string[] | null, extensions?: string[] }} Pack
 * @typedef {{ locator: import("./locators.mjs").Locator, url: string }} Part
 * @typedef {{ language: string, pkg: string, version: string, label: string,
 *   wasm: Part, tags: Part[], extensions?: string[] }} Resolved
 */

/**
 * @param {string} language @param {Pack} pack
 * @param {{ previous?: { package?: string, wasm?: { url: string }, tags?: { url: string }[] }, upgrade?: boolean }} options
 * @returns {Promise<Resolved>}
 */
export async function resolvePack(language, pack, options = {}) {
  if (!pack.package)
    throw new Error(`${language}: packs.json entry has no "package"`);
  const version = await packVersion(pack, options);
  const previousTags = options.previous?.tags ?? [];
  const repo = repoOf(pack.package);

  const wasm = await resolvePart(
    pack.wasm
      ? parseLocator(pack.wasm, pack.package, version)
      : defaultWasm(pack.package, repo, version),
    version,
    options.upgrade === true ? undefined : options.previous?.wasm?.url,
  );
  const tags = [];
  for (const [at, source] of tagSources(pack).entries()) {
    tags.push(
      await resolvePart(
        parseLocator(source, pack.package, version),
        version,
        options.upgrade === true ? undefined : previousTags[at]?.url,
      ),
    );
  }

  return {
    language,
    pkg: pack.package,
    version,
    label: `${pack.package}@${version}`,
    wasm,
    tags,
    ...(pack.extensions ? { extensions: pack.extensions } : {}),
  };
}

/**
 * A published pack's grammar sits in its npm tarball; a released one is an
 * asset of the release its version names — npm has none to ship.
 * @returns {import("./locators.mjs").Locator}
 */
function defaultWasm(pkg, repo, version) {
  const path = DEFAULT_WASM(pkg);
  return repo
    ? { kind: "release", repo, ref: version, path }
    : { kind: "npm", pkg, path, own: true };
}

/** `tags: null` is the maintainer saying upstream ships none — not an omission. */
export function tagSources(pack) {
  if (pack.tags === null) return [];
  if (pack.tags === undefined) return [DEFAULT_TAGS];
  return Array.isArray(pack.tags) ? pack.tags : [pack.tags];
}

/**
 * Explicit beats locked beats newest. A lock naming a different package pins
 * nothing: the entry has been repointed since that lock was written.
 */
async function packVersion(pack, options) {
  if (pack.version) return pack.version;
  const label = options.previous?.package ?? "";
  const cut = label.lastIndexOf("@");
  const locked =
    cut > 0 && label.slice(0, cut) === pack.package
      ? label.slice(cut + 1)
      : undefined;
  if (locked && options.upgrade !== true) return locked;
  return newestVersion(pack.package);
}

/**
 * @param {import("./locators.mjs").Locator} locator
 * @param {string} version the pack's own pinned version
 * @param {string | undefined} previousUrl
 * @returns {Promise<Part>}
 */
async function resolvePart(locator, version, previousUrl) {
  const locked = lockedRef(locator, previousUrl);
  if (locator.kind === "gh") {
    const commit = locked ?? (await refCommit(locator.repo, locator.ref));
    return { locator, url: locatorUrl(locator, { commit }) };
  }
  if (locator.kind === "npm" && !locator.version && locator.own !== true) {
    const resolved = locked ?? (await newestVersion(locator.pkg));
    return { locator, url: locatorUrl(locator, { version: resolved }) };
  }
  return { locator, url: locatorUrl(locator, { version }) };
}
