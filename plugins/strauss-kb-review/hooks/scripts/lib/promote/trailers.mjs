// @ts-check
/**
 * `Addresses:` and `Pinned-by:` off the range's commits. A record says a risk
 * is closed; only the commit says which change closed it and which test holds
 * it closed.
 */
import { git } from "../git.mjs";
import { oneLine } from "../util.mjs";

/** @typedef {{ addressedBy: Map<string, string[]>, pinnedBy: Map<string, string[]> }} Trailers */

/**
 * A commit block is NUL-delimited, its first line the short sha and the rest
 * the message — a message can hold anything but a NUL.
 * @param {string} cwd @param {string[]} range @returns {Trailers}
 */
export function readTrailers(cwd, range) {
  /** @type {Trailers} */
  const trailers = { addressedBy: new Map(), pinnedBy: new Map() };
  const out = git(cwd, [
    "log",
    "--reverse",
    "--format=%x00%h%n%B",
    "--end-of-options",
    ...range,
  ]);
  if (out === null) return trailers;

  for (const block of out.split("\0")) {
    const lines = block.split("\n");
    const short = (lines[0] ?? "").trim();
    if (!short) continue;
    const message = lines.slice(1).join("\n");
    const pins = trailerValues(message, "Pinned-by");
    for (const id of trailerValues(message, "Addresses")) {
      push(trailers.addressedBy, id, short);
      for (const test of pins) push(trailers.pinnedBy, id, test);
    }
  }
  return trailers;
}

/** Every `Name: value` line, values split on commas.
 * @param {string} message @param {string} name @returns {string[]} */
function trailerValues(message, name) {
  /** @type {string[]} */
  const values = [];
  const pattern = new RegExp(`^${name}:\\s*(.+)$`, "gim");
  for (const match of message.matchAll(pattern)) {
    for (const value of (match[1] ?? "").split(",")) {
      const text = oneLine(value, 120);
      if (text) values.push(text);
    }
  }
  return values;
}

/** @param {Map<string, string[]>} map @param {string} key @param {string} value */
function push(map, key, value) {
  const held = map.get(key) ?? [];
  if (!held.includes(value)) held.push(value);
  map.set(key, held);
}
