// @ts-check
/**
 * A pack is only pinned once both parts have been proved: the WASM loads under
 * the installed `web-tree-sitter`, and the tags query compiles against it. A
 * part that is missing, empty or will not load fails the run rather than
 * shipping a language the resolver would report unavailable at read time.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { text, tryGet } from "./http.mjs";
import { locatorLabel } from "./locators.mjs";

const PROVE = join(import.meta.dirname, "prove.mjs");

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
        `to another locator (npm:, gh:, https:)${alternative}`,
    );
    this.name = "PartError";
  }
}

/**
 * @param {import("./resolve.mjs").Resolved} pack @param {Downloaded} fetched
 */
export async function validate(pack, fetched) {
  const failed = await prove(fetched.wasm.body, fetched.query);
  if (failed?.part === "wasm")
    throw new PartError(
      pack,
      "wasm",
      pack.wasm,
      `does not load under web-tree-sitter: ${failed.message}`,
    );
  if (failed)
    throw new PartError(
      pack,
      "tags",
      pack.tags[0],
      `does not compile against ${pack.label}: ${failed.message}`,
    );
  return { compiled: fetched.tags.length > 0 };
}

/**
 * `null` when the grammar loads and the query compiles, otherwise which part
 * failed and why. Runs in a worker; see prove.mjs.
 * @param {Uint8Array} wasm @param {string} query
 * @returns {Promise<{ part: "wasm" | "tags", message: string } | null>}
 */
export function prove(wasm, query) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(PROVE, { workerData: { wasm, query } });
    worker.once("message", (result) => {
      resolve(result);
      void worker.terminate();
    });
    worker.once("error", reject);
  });
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function message(error) {
  return error instanceof Error ? error.message : String(error);
}
