// @ts-check
/**
 * A pack is only pinned once both parts have been proved: the WASM loads under
 * the installed `web-tree-sitter`, and the tags query compiles against it. A
 * part that is missing, empty or will not load fails the run rather than
 * shipping a language the resolver would report unavailable at read time.
 */
import { createHash } from "node:crypto";
import { Language, Parser, Query } from "web-tree-sitter";
import { text, tryGet } from "./http.mjs";
import { locatorLabel } from "./locators.mjs";

/** Enough to make each grammar build a tree, in one line, for any syntax. */
const SNIPPET = "a b\n";

/**
 * @typedef {{ url: string, sha256: string, bytes: number, body: Uint8Array }} Fetched
 * @typedef {{ language: string, label: string, wasm: Fetched, tags: Fetched[],
 *   query: string }} Downloaded
 */

/** @param {import("./resolve.mjs").Resolved} pack @returns {Promise<Downloaded>} */
export async function download(pack) {
  const wasm = await fetchPart(pack, "wasm", pack.wasm);
  const tags = [];
  for (const part of pack.tags) tags.push(await fetchPart(pack, "tags", part));
  return {
    language: pack.language,
    label: pack.label,
    wasm,
    tags,
    query: concatenate(tags),
  };
}

/**
 * Parts concatenate in the order packs.json lists them: upstream ships
 * TypeScript's tags as a delta over JavaScript's, so the two are one query.
 * @param {{ url: string, body: Uint8Array }[]} tags
 */
export function concatenate(tags) {
  return tags.map((part) => `; ${part.url}\n${lf(text(part.body))}`).join("\n");
}

/** Line endings are the one thing not vendored verbatim; CRLF churns the diff. */
function lf(body) {
  return body.replace(/\r\n/g, "\n");
}

/**
 * @param {import("./resolve.mjs").Resolved} pack
 * @param {"wasm" | "tags"} kind
 * @param {import("./resolve.mjs").Part} part
 * @returns {Promise<Fetched>}
 */
async function fetchPart(pack, kind, part) {
  const body = await tryGet(part.url);
  if (!body?.byteLength) throw new PartError(pack, kind, part, "not found");
  return {
    url: part.url,
    sha256: sha256(body),
    bytes: body.byteLength,
    body,
  };
}

/** Names the language, the part, the URL tried, and where to configure another. */
export class PartError extends Error {
  /**
   * @param {import("./resolve.mjs").Resolved} pack
   * @param {"wasm" | "tags"} kind
   * @param {import("./resolve.mjs").Part} part @param {string} why
   */
  constructor(pack, kind, part, why) {
    const alternative =
      kind === "tags" ? ", or null if the release ships no tags query" : "";
    super(
      `${pack.language}: ${kind} ${why}\n` +
        `  locator ${locatorLabel(part.locator)}\n` +
        `  tried   ${part.url}\n` +
        `  set "${kind}" on the ${pack.language} entry in grammars/packs.json ` +
        `to another locator (npm:, gh:, gh-release:, https:)${alternative}`,
    );
    this.name = "PartError";
  }
}

/**
 * @typedef {{ language: string, label: string, wasm: Uint8Array,
 *   query?: string }} Provable
 */

/**
 * Every pack loaded, compiled and parsed with in one process, in manifest
 * order — which is how the runtime meets them, an MCP server holding all the
 * grammars a repository needs at once. A grammar built at an ABI this
 * `web-tree-sitter` does not accept is rejected here rather than at read time,
 * and the first failure names the pack and stops the run.
 * @param {Provable[]} packs @param {(line: string) => void} log
 */
export async function proveAll(packs, log) {
  await Parser.init();
  const parser = new Parser();
  let queries = 0;
  for (const pack of packs) {
    let grammar;
    try {
      grammar = await Language.load(pack.wasm);
    } catch (error) {
      throw new ProveError(pack, "wasm", `${message(error)}`);
    }
    if (pack.query) {
      try {
        new Query(grammar, pack.query);
      } catch (error) {
        throw new ProveError(pack, "tags", message(error));
      }
      queries++;
    }
    try {
      parser.setLanguage(grammar);
      if (!parser.parse(SNIPPET)) throw new Error("parsed to nothing");
    } catch (error) {
      throw new ProveError(pack, "wasm", `does not parse: ${message(error)}`);
    }
  }
  parser.delete();
  log(
    `${packs.length} grammars loaded together, ${queries} tags queries compiled`,
  );
}

/** Which pack failed, at which part, under which runtime. */
class ProveError extends Error {
  /** @param {Provable} pack @param {"wasm" | "tags"} kind @param {string} why */
  constructor(pack, kind, why) {
    super(
      kind === "wasm"
        ? `${pack.language}: ${pack.label} rejected by web-tree-sitter: ${why || "no reason given"}`
        : `${pack.language}: tags query does not compile against ${pack.label}: ${why}`,
    );
    this.name = "ProveError";
  }
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function message(error) {
  return error instanceof Error ? error.message : String(error);
}
