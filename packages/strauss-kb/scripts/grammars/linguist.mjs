// @ts-check
/**
 * Which file extensions a pack claims. GitHub Linguist at the tag packs.json
 * pins is the default; a pack that names `extensions` overrides it, which is
 * also how a collision is settled — `.h` is C's, not Objective-C's.
 */
import { get, text } from "./http.mjs";
import { refCommit } from "./registry.mjs";

const LINGUIST_REPO = "github-linguist/linguist";
const RAW = "https://raw.githubusercontent.com";

/** @param {string} ref a tag or a commit */
export async function linguistLanguages(ref) {
  const commit = await refCommit(LINGUIST_REPO, ref);
  const yaml = text(
    await get(`${RAW}/${LINGUIST_REPO}/${commit}/lib/linguist/languages.yml`),
  );
  return { tag: ref, commit, byName: parse(yaml) };
}

/**
 * Extension list per pack, disjoint. `extensions` replaces a pack's Linguist
 * list outright; `claims` keeps it and wins the named extensions when Linguist
 * gives them to more than one pack. An unclaimed collision is dropped and
 * reported rather than guessed at.
 * @param {{ language: string, linguist?: string, extensions?: string[],
 *   claims?: string[] }[]} packs
 * @param {Map<string, string[]>} byName
 */
export function extensionsFor(packs, byName) {
  /** @type {Map<string, string>} */
  const owner = new Map();
  const settled = new Set();
  const clashes = new Set();
  const missing = [];

  for (const pack of packs)
    for (const extension of [...(pack.extensions ?? []), ...(pack.claims ?? [])]
      .map((one) => one.toLowerCase())
      .filter((one) => !settled.has(one))) {
      owner.set(extension, pack.language);
      settled.add(extension);
    }

  for (const pack of packs.filter((pack) => !pack.extensions)) {
    const name = pack.linguist ?? capitalise(pack.language);
    const found = byName.get(name.toLowerCase());
    if (!found) {
      missing.push(`${pack.language} (no Linguist language "${name}")`);
      continue;
    }
    for (const extension of found) {
      if (settled.has(extension)) continue;
      const claimed = owner.get(extension);
      if (claimed && claimed !== pack.language) {
        clashes.add(`${extension} (${claimed}, ${pack.language})`);
        owner.delete(extension);
        settled.add(extension);
      } else if (!claimed) {
        owner.set(extension, pack.language);
      }
    }
  }

  /** @type {Map<string, string[]>} */
  const table = new Map(packs.map((pack) => [pack.language, []]));
  for (const [extension, language] of [...owner].sort())
    table.get(language)?.push(extension);
  return { table, clashes: [...clashes].sort(), missing };
}

function capitalise(language) {
  return `${language.charAt(0).toUpperCase()}${language.slice(1)}`;
}

/**
 * languages.yml is one flat mapping of language name to a block carrying an
 * `extensions:` list — small enough that a scanner beats a YAML dependency.
 * @param {string} yaml
 */
function parse(yaml) {
  /** @type {Map<string, string[]>} */
  const byName = new Map();
  let name = "";
  let inExtensions = false;
  for (const line of yaml.split("\n")) {
    const top = /^([^\s#][^:]*):\s*$/.exec(line);
    if (top) {
      name = (top[1] ?? "").replace(/^["']|["']$/g, "").toLowerCase();
      inExtensions = false;
      continue;
    }
    if (/^ {2}extensions:\s*$/.test(line)) {
      inExtensions = true;
      continue;
    }
    const item = /^ {2}-\s+(.+?)\s*$/.exec(line);
    if (!item) {
      inExtensions = false;
      continue;
    }
    if (!inExtensions) continue;
    const extension = (item[1] ?? "").replace(/^["']|["']$/g, "").toLowerCase();
    if (extension.startsWith("."))
      byName.set(name, [...(byName.get(name) ?? []), extension]);
  }
  return byName;
}
