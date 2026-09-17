// @ts-check
/**
 * One knowledge base, read. `load --all` answers standing — only the CLI
 * resolves supersession — and the record files answer the frontmatter `load`
 * does not return.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { json } from "./cli.mjs";
import { asArray, asString, parseFrontmatter } from "./util.mjs";

/**
 * @typedef {{ conceptId: string, file: string, type: string, title: string,
 *   status: string, standing: string, body: string,
 *   anchors: import("./util.mjs").Anchor[],
 *   links: import("./util.mjs").Link[], tags: string[], sources: unknown[],
 *   materiality?: string, confidence?: string, owner?: string,
 *   assumption: boolean, verify: string[], verified: unknown[],
 *   writtenBy?: string, writtenAt?: string }} BaseRecord
 */

/**
 * Standing per concept id, from the one reader that resolves supersession.
 * @param {import("./cli.mjs").Launcher} kb @returns {Map<string, string>}
 */
export function standings(kb) {
  const loaded = /** @type {any} */ (json(kb, ["load", "--all"]));
  /** @type {Map<string, string>} */
  const standing = new Map();
  for (const record of asArray(loaded?.records)) {
    standing.set(String(/** @type {any} */ (record).conceptId), "current");
  }
  for (const record of asArray(loaded?.superseded)) {
    standing.set(String(/** @type {any} */ (record).conceptId), "superseded");
  }
  return standing;
}

/**
 * Standing applied to what `readBase` found. Separate from the read so an empty
 * bundle costs no subprocess: `standings` spawns the CLI, `readBase` does not.
 * @param {BaseRecord[]} records @param {Map<string, string>} standing
 * @returns {BaseRecord[]}
 */
export function withStandings(records, standing) {
  return records.map((record) => ({
    ...record,
    standing: standing.get(record.conceptId) ?? "current",
  }));
}

/**
 * Every record in `bundle`, standing not yet resolved.
 * @param {string} bundle @returns {BaseRecord[]}
 */
export function readBase(bundle) {
  /** @type {string[]} */
  let names;
  try {
    // A record file is `<type>.<slug>.md`. The inner dot is what tells one from
    // the base's own markdown — `INDEX.md`, and `REPORT.md` at level 2.
    names = readdirSync(bundle).filter(
      (name) => name.endsWith(".md") && name.slice(0, -3).includes("."),
    );
  } catch {
    return [];
  }
  return names.map((name) => {
    const file = join(bundle, name);
    const { data, body } = parseFrontmatter(safeRead(file));
    const conceptId = name.slice(0, -3);
    return {
      conceptId,
      file,
      type: asString(data.type) || conceptId.split(".")[0] || "",
      title: asString(data.title),
      status: asString(data.strauss_status) || "accepted",
      standing: "current",
      body,
      anchors: /** @type {import("./util.mjs").Anchor[]} */ (
        asArray(data.strauss_anchors)
      ),
      links: /** @type {import("./util.mjs").Link[]} */ (
        asArray(data.strauss_links)
      ),
      tags: asArray(data.tags).map(String),
      sources: asArray(data.sources),
      materiality: asString(data.strauss_materiality) || undefined,
      confidence: asString(data.strauss_confidence) || undefined,
      owner: asString(data.strauss_owner) || undefined,
      assumption: data.strauss_assumption === true,
      verify: asArray(data.strauss_verify).map(String),
      verified: asArray(data.verified),
      writtenBy: asString(/** @type {any} */ (data.generated)?.by) || undefined,
      writtenAt: asString(/** @type {any} */ (data.generated)?.at) || undefined,
    };
  });
}

/** @param {string} path */
function safeRead(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}
