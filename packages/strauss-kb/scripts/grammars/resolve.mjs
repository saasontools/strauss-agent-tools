// @ts-check
/**
 * packs.json entry → the exact URLs one language pack is built from.
 *
 * A pack holds still by default: the version a part was locked at last run is
 * reused, so re-pinning the same packs.json reproduces the same manifest. Only
 * `upgrade` re-asks the registry what is newest.
 */
import { lockedRef, locatorUrl, parseLocator } from "./locators.mjs";
import { latestVersion, refCommit } from "./registry.mjs";

/** What a pack gets when it names neither `wasm` nor `tags`. */
const DEFAULT_WASM = (pkg) => `${pkg.replace(/^@[^/]+\//, "")}.wasm`;
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

  const wasm = await resolvePart(
    parseLocator(pack.wasm ?? DEFAULT_WASM(pack.package), pack.package),
    version,
    options.upgrade === true ? undefined : options.previous?.wasm?.url,
  );
  const tags = [];
  for (const [at, source] of tagSources(pack).entries()) {
    tags.push(
      await resolvePart(
        parseLocator(source, pack.package),
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

/** `tags: null` is the maintainer saying upstream ships none — not an omission. */
export function tagSources(pack) {
  if (pack.tags === null) return [];
  if (pack.tags === undefined) return [DEFAULT_TAGS];
  return Array.isArray(pack.tags) ? pack.tags : [pack.tags];
}

/** Explicit beats locked beats newest. */
async function packVersion(pack, options) {
  if (pack.version) return pack.version;
  const locked = options.previous?.package?.split("@").pop();
  if (locked && options.upgrade !== true) return locked;
  return latestVersion(pack.package);
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
    const resolved = locked ?? (await latestVersion(locator.pkg));
    return { locator, url: locatorUrl(locator, { version: resolved }) };
  }
  return { locator, url: locatorUrl(locator, { version }) };
}
