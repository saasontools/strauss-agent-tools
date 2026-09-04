// @ts-check
/** What the npm registry and the GitHub API are asked, each answer memoised. */
import { getJson, text, tryGet } from "./http.mjs";

const REGISTRY = "https://registry.npmjs.org";
const GITHUB = "https://api.github.com";

/** @type {Map<string, Promise<unknown>>} */
const memo = new Map();

/** @template T @param {string} key @param {() => Promise<T>} load */
function once(key, load) {
  if (!memo.has(key)) memo.set(key, load());
  return /** @type {Promise<T>} */ (memo.get(key));
}

/** @param {string} pkg */
function packument(pkg) {
  return once(`npm:${pkg}`, () =>
    getJson(`${REGISTRY}/${encodeURIComponent(pkg)}`),
  );
}

/**
 * The newest published release that is not a prerelease — what "no `version`
 * in packs.json" resolves to at pin time.
 * @param {string} pkg
 */
export async function latestVersion(pkg) {
  const document = /** @type {{ versions?: Record<string, unknown> }} */ (
    await packument(pkg)
  );
  const newest = Object.keys(document.versions ?? {})
    .filter((version) => !version.includes("-"))
    .sort(compareVersions)
    .at(-1);
  if (!newest) throw new Error(`${pkg}: no published release on npm`);
  return newest;
}

/** @param {string} pkg @param {string} version */
export async function npmLicense(pkg, version) {
  const document =
    /** @type {{ versions?: Record<string, { license?: string }> }} */ (
      await packument(pkg)
    );
  return document.versions?.[version]?.license ?? "see repository";
}

/** The commit a tag, branch or commit-ish resolves to. */
export async function refCommit(repo, ref) {
  return once(`gh:${repo}@${ref}`, async () => {
    for (const candidate of [ref, `v${ref}`]) {
      const bytes = await tryGet(`${GITHUB}/repos/${repo}/commits/${candidate}`);
      if (bytes) return /** @type {{ sha: string }} */ (JSON.parse(text(bytes)))
        .sha;
    }
    throw new Error(`${repo}: no commit for ref ${ref}`);
  });
}

/** @param {string} repo */
export async function githubLicense(repo) {
  return once(`license:${repo}`, async () => {
    const bytes = await tryGet(`${GITHUB}/repos/${repo}/license`);
    const spdx = bytes ? JSON.parse(text(bytes)).license?.spdx_id : undefined;
    return spdx ?? "see repository";
  });
}

/** @param {string} a @param {string} b */
export function compareVersions(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let at = 0; at < 3; at++) {
    const difference = (x[at] ?? 0) - (y[at] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

/** @param {string} version */
function parts(version) {
  return version.split(".").map((part) => Number.parseInt(part, 10) || 0);
}
